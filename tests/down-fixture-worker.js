// LOCAL QA ONLY: deterministic horizontal landmarks, not model predictions.
import {PersonDownMonitor} from '../browser/person-down.js';
const monitor=new PersonDownMonitor();
onmessage=({data})=>{
  if(data.type==='load'){postMessage({type:'ready'});return;}
  if(data.type==='zones'){monitor.configure(data.zones);return;}
  if(data.type!=='frame')return;
  const {bitmap,timestamp}=data;
  const landmarks=Array.from({length:33},()=>({x:.5,y:.5,visibility:.9,presence:.9}));
  for(const [indices,x,y] of [[[11,12],.25,.55],[[23,24],.55,.57],[[25,26],.7,.58],[[27,28],.85,.6]])for(const i of indices)landmarks[i]={x,y,visibility:.9,presence:.9};
  const person={id:1,state:'monitoring',landmarks,box:[bitmap.width*.2,bitmap.height*.4,bitmap.width*.9,bitmap.height*.65],reason:'LOCAL QA synthetic non-fall classifier',rawClass:3,rawScore:1,samples:100};
  postMessage({type:'result',timestamp,people:monitor.update([person],timestamp/1000,bitmap.width,bitmap.height),width:bitmap.width,height:bitmap.height,detected:1,inferenceMs:0});bitmap.close();
};
