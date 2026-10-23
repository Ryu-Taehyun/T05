const fs=require('fs'),vm=require('vm'),assert=require('assert');
const path=require('path');const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const source=html.match(/<script id="model">([\s\S]*?)<\/script>/)[1];
function fresh(){return vm.runInNewContext(source+';Relay',{Date,Math,JSON,Set,Error});}
function run(){const R=fresh(),results=[];const check=(id,f)=>{f();results.push(id+' PASS');};
check('T01',()=>{const s=R.initial();assert.equal(s.tasks.length,3);assert.equal(R.percent(s),33);});
check('T02',()=>{const s=R.initial();assert.throws(()=>R.add(s,'  '));R.add(s,'회의 자료 정리','확인 조건');assert.equal(s.tasks.length,4);assert.equal(s.tasks[3].status,'todo');});
check('T03',()=>{const s=R.initial();R.move(s,s.tasks[1].id,'done');assert.equal(R.percent(s),67);assert.throws(()=>R.move(s,s.tasks[0].id,'invalid'));});
check('T04',()=>{const s=R.initial();R.remove(s,s.tasks[0].id);assert.equal(s.tasks.length,2);});
check('T05',()=>{const s=R.initial();R.add(s,'회의 자료 정리','발표 리허설');assert.equal(R.search(s,'회의').length,1);assert.equal(R.search(s,'리허설').length,1);assert.equal(R.search(s,'없는문구').length,0);});
check('T06',()=>{const s=R.initial(),data=new Map(),storage={setItem:(k,v)=>data.set(k,v),getItem:k=>data.get(k)??null};R.add(s,'회의 자료 정리');R.save(storage,s);assert.equal(JSON.stringify(fresh().load(storage)),JSON.stringify(s));});
check('T07',()=>{const s=R.initial();s.context={goal:'발표 완성',next:'자료 검토',blocker:'통계 확인'};assert.equal(JSON.stringify(R.decode(R.encode(s))),JSON.stringify(s));});
check('T08',()=>{assert.throws(()=>R.decode('{'));const s=R.initial();s.tasks[1].id=s.tasks[0].id;assert.throws(()=>R.validate(s));s.tasks[1].id='unique';s.tasks[0].status='bad';assert.throws(()=>R.validate(s));});
return results;}
if(require.main===module){console.log(run().join('\n'));const R=fresh(),s=R.initial();R.add(s,'회의 자료 정리','검토 후 발표');s.context={goal:'발표 완성',next:'자료 검토',blocker:'통계 확인'};fs.writeFileSync(path.join(__dirname,'A-handoff.json'),R.encode(s));}
module.exports={fresh,run,html};
