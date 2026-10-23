// Independent session B UI replay. No browser or external packages required.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const fixed=require('./verify.cjs');
const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const model=html.match(/<script id="model">([\s\S]*?)<\/script>/)[1];
const ui=html.match(/<script id="ui">([\s\S]*?)<\/script>/)[1];
function environment({stored,broken=false,saveBroken=false}={}){
  const elements=new Map(),data=new Map(stored?[['relay-board-v1',stored]]:[]);
  let writes=0,confirms=0,answer=true,exportBlob;
  function element(tag){return {tag,children:[],value:'',textContent:'',files:[],classList:{toggle(){}},append(...v){this.children.push(...v);},replaceChildren(...v){this.children=v;},setAttribute(){},showModal(){},close(){},focus(){},reset(){},remove(){},click(){}};}
  const document={getElementById(id){if(!elements.has(id))elements.set(id,element(id));return elements.get(id);},createElement:element,createTextNode:text=>({textContent:text}),body:element('body')};
  const storage={getItem:k=>{if(broken)throw Error('storage unavailable');return data.get(k)??null;},setItem:(k,v)=>{writes++;if(saveBroken)throw Error('quota');data.set(k,v);}};
  const urls={createObjectURL:blob=>{exportBlob=blob;return 'blob:vm-export';},revokeObjectURL(){}};
  const context=vm.createContext({document,localStorage:storage,confirm:()=>{confirms++;return answer;},Date,Math,JSON,Set,Error,setTimeout,Blob,URL:urls});
  vm.runInContext(model+'\n'+ui,context);
  const state=()=>JSON.parse(vm.runInContext('JSON.stringify(state)',context));
  async function choose(raw,{size=Buffer.byteLength(raw||''),accept=true,readError=false}={}){answer=accept;const input=document.getElementById('importFile');input.value='selected.json';input.files=[{size,text:async()=>{if(readError)throw Error('read failed');return raw;}}];await input.onchange();}
  return {state,choose,data,storage,elements,context,exportText:async()=>{document.getElementById('exportBtn').onclick();return exportBlob.text();},get writes(){return writes;},get confirms(){return confirms;}};
}
async function main(){
  console.log(fixed.run().join('\n'));
  const exported=fs.readFileSync(path.join(__dirname,'A-handoff.json'),'utf8');
  const expected=JSON.parse(exported);delete expected.exportedAt;
  const first=environment();await first.choose(exported);
  assert.deepStrictEqual(first.state(),expected);
  for(const key of ['goal','next','blocker'])assert.equal(first.elements.get(key).value,expected.context[key]);
  assert.equal(first.elements.get('summary').textContent,'1개 완료 / 전체 4개');
  assert.equal(first.elements.get('percent').textContent,'25%');
  const reloaded=environment({stored:first.data.get('relay-board-v1')});
  assert.deepStrictEqual(reloaded.state(),expected);
  // Re-run A's unchanged T01-T08 in fresh VM model contexts after the import.
  assert.equal(fixed.run().length,8);
  // Exercise the common scenario in B's newly initialized UI environment.
  vm.runInContext("Relay.move(state,state.tasks.find(t=>t.title==='회의 자료 정리').id,'doing');state.context.next='발표 리허설';persist();render();",reloaded.context);
  const moved=reloaded.state();assert.equal(moved.tasks[3].status,'doing');
  const roundtrip=environment();await roundtrip.choose(await reloaded.exportText());assert.deepStrictEqual(roundtrip.state(),moved);
  console.log('T09 PASS — A file imported in fresh UI VM, saved/reloaded, fixed T01-T08 rerun, common scenario moved/exported/imported');
  for(const [label,raw,options] of [
    ['cancel',exported,{accept:false}],['invalid JSON','{',{}],
    ['duplicate IDs',JSON.stringify({...expected,tasks:[expected.tasks[0],expected.tasks[0]]}),{}],
    ['invalid status',JSON.stringify({...expected,tasks:[{...expected.tasks[0],status:'bad'}]}),{}],
    ['oversize',exported,{size:2*1024*1024+1}],['read failure',exported,{readError:true}]
  ]){const e=environment(),before=e.state();await e.choose(raw,options);assert.deepStrictEqual(e.state(),before,label);assert.equal(e.writes,0,label);assert.equal(e.elements.get('importFile').value,'',label);if(label!=='cancel')assert.equal(e.confirms,0,label);}
  const broken=environment({stored:'unreadable original',broken:true});await broken.choose(exported);assert.deepStrictEqual(broken.state(),expected);assert.equal(broken.writes,0);assert.equal(broken.data.get('relay-board-v1'),'unreadable original');
  const quota=environment({saveBroken:true});await quota.choose(exported);assert.deepStrictEqual(quota.state(),expected);assert.match(quota.elements.get('notice').textContent,/저장하지 못했습니다/);
  const boundary=environment();await boundary.choose(exported,{size:2*1024*1024});assert.deepStrictEqual(boundary.state(),expected);
  const noFile=environment(),before=noFile.state();await noFile.elements.get('importFile').onchange();assert.deepStrictEqual(noFile.state(),before);
  const race=environment();let release;race.elements.get('importFile').files=[{size:1,text:()=>new Promise(resolve=>release=resolve)}];const pending=race.elements.get('importFile').onchange();await race.choose(exported);release(JSON.stringify({...expected,context:{...expected.context,goal:'stale'}}));await pending;assert.deepStrictEqual(race.state(),expected);
  console.log('T10 PASS — success, cancel, bad JSON/schema, >2MB, exact 2MB, read failure, empty selection, storage guards, stale read; preservation asserted');
  console.log('Environment: '+process.version+' / '+process.platform+'; UI handlers executed in isolated Node VM with DOM/file/storage/confirm stubs. No browser click or layout claim.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
