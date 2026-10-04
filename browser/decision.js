// UI policy is shared with tests, rather than inferred from skeleton colors.
export function warningKind(person,editing=false) {
  if(!editing&&person.down?.posture==='excluded')return null;
  if(person.state==='possible-fall')return 'fall';
  if(editing)return null;
  if(person.down?.state==='possible-fall')return 'fall';
  return person.down?.state==='person-down'?'down':null;
}
export function displayState(person,editing=false) {
  if(warningKind(person,editing))return 'possible-fall';
  if(!editing&&person.down?.state==='down-evaluating')return 'evaluating';
  if(!editing&&['standing','sitting','lying'].includes(person.down?.posture))return 'monitoring';
  return person.state==='possible-fall'?'monitoring':person.state;
}
export function displayLabel(person,editing=false) {
  const kind=warningKind(person,editing);
  if(kind)return kind==='fall'?'Possible fall':'Person may be down';
  if(!editing&&person.down?.state==='down-evaluating')return `Down posture ${person.down.elapsed.toFixed(1)}/${person.down.required}s`;
  if(!editing&&person.down?.posture==='excluded')return 'Excluded region';
  if(!editing&&['standing','sitting','lying'].includes(person.down?.posture))return {standing:'Standing',sitting:'Sitting',lying:'Lying posture'}[person.down.posture];
  return {'monitoring':'Tracking','evaluating':'Evaluating','warming-up':'Learning movement','unavailable':'Pose unclear','possible-fall':'Tracking'}[person.state];
}
