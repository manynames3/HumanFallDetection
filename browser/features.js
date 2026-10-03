// Adapted from vis/inv_pendulum.py and algorithms.py, upstream MIT license.
// Intentionally retain the trained model's formula/operator order, including
// upstream doubledel_theta=(delta/0.5)*(t1+t2), not a corrected physics formula.
const sub = (a,b) => [a[0]-b[0],a[1]-b[1]];
const dot = (a,b) => a[0]*b[0]+a[1]*b[1];
const norm = a => Math.hypot(...a);
const angle = (a,b) => Math.atan2(a[0]*b[1]-a[1]*b[0],dot(a,b));
export const verticalAngle = v => Math.atan2(-v[0],-v[1]);
export const ratio = p => (p.box[2]-p.box[0])/(p.box[3]-p.box[1]);

export function features(current, previous = []) {
  const vector = sub(current.N,current.B), theta = verticalAngle(vector);
  const values = [ratio(current), Math.log1p(Math.abs(theta)), 0, 0, 0];
  const p = previous.at(-1), pp = previous.at(-2);
  if (p) {
    const t = current.time-p.time;
    if (!(t > 0)) throw new Error('Non-monotonic pose time');
    const n1 = vector, n0 = sub(p.N,p.B), h1 = sub(current.H,current.B), h0 = sub(p.H,p.B);
    const den = 5*dot(n1,n1)+dot(h1,h1);
    if (den < 1e-10) throw new Error('Degenerate body geometry');
    values[2] = (5*dot(n1,n1)*(angle(n0,n1)/t)**2+dot(h1,h1)*(angle(h0,h1)/t)**2)/(2*den);
    values[3] = (values[0]-ratio(p))/t;
  }
  if (p && pp) values[4] = generalizedForce(pp,p,current);
  if (!values.every(Number.isFinite)) throw new Error('Nonfinite pose features');
  return {values, theta};
}

export function generalizedForce(p0,p1,p2) {
  const t1 = p1.time-p0.time, t2 = p2.time-p1.time;
  const H = [p0,p1,p2].map(p => sub(p.H,p.N));
  const N = [p0,p1,p2].map(p => sub(p.N,p.B));
  if (norm(N[1]) < 1e-6) throw new Error('Degenerate torso');
  const d1 = norm(H[1])/norm(N[1]);
  const theta2 = verticalAngle(N[1]), theta1 = verticalAngle(H[1])-theta2;
  const h0 = angle(H[0],H[1])/t1, h1 = angle(H[1],H[2])/t2;
  const n0 = angle(N[0],N[1])/t1, n1 = angle(N[1],N[2])/t2;
  const v1 = .5*(h1+h0), v2 = .5*(n1+n0);
  const a1 = (h1-h0)/.5*(t1+t2), a2 = (n1-n0)/.5*(t1+t2);
  let q1 = d1*a1*a1 + (d1*d1+d1*Math.cos(theta1))*a2;
  q1 += d1*Math.sin(theta1)*v2*v2 - 10*Math.sin(theta1+theta2);
  let q2 = (d1*d1+d1*Math.cos(theta1))*a1;
  q2 += (16+d1*d1+2*d1*Math.cos(theta1))*a2;
  q2 -= 2*d1*Math.sin(theta1)*v2*v1+d1*Math.sin(theta1)*v1*v1;
  q2 -= 160*Math.sin(theta2)+10*d1*Math.sin(theta1+theta2);
  return q1+q2;
}

// MediaPipe->COCO mapping. Head weights and shoulder/hip means preserve get_kp.
const COCO = [0,2,5,7,8,11,12,13,14,15,16,23,24,25,26,27,28];
export function poseFromLandmarks(landmarks, width, height, time) {
  const score = p => Math.min(p?.visibility ?? 0,p?.presence ?? 1);
  const coco = COCO.map(i => landmarks[i]);
  const core = [coco[1],coco[2],coco[3],coco[4],coco[5],coco[6],coco[11],coco[12]];
  if (core.some(p => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || score(p)<.5)) return null;
  const mean = (a,b) => [(a.x+b.x)/2,(a.y+b.y)/2];
  const head = core.slice(0,4), sum = head.reduce((s,p)=>s+score(p),0);
  const H = [0,0];
  for (const p of head) { H[0]+=p.x*score(p)/sum;H[1]+=p.y*score(p)/sum; }
  const visible = coco.slice(0,15).filter(p=>score(p)>=.5);
  const xs = visible.map(p=>p.x*width), ys = visible.map(p=>p.y*height);
  const box = [Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];
  if (box[3]-box[1]<5 || box[2]-box[0]<3) return null;
  return {H,N:mean(coco[5],coco[6]),B:mean(coco[11],coco[12]),box,time,landmarks};
}
