const path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'../../tools/js-toolchain/node_modules/eas-cli/build');
const load=p=>require(path.join(root,p));
const {default:SessionManager}=load('user/SessionManager');
const {createGraphqlClient}=load('commandUtils/context/contextUtils/createGraphqlClient');
const {BuildQuery}=load('graphql/queries/BuildQuery');
const session=new SessionManager({setActor(){}});
const client=createGraphqlClient({accessToken:session.getAccessToken(),sessionSecret:session.getSessionSecret()});
function readJson(file){const bytes=fs.readFileSync(file);return JSON.parse(bytes.toString(bytes[0]===255&&bytes[1]===254?'utf16le':'utf8').replace(/^\uFEFF/,''));}
(async()=>{
 const file=path.join(__dirname,'device-build-launch.json');
 const launch=readJson(file);
 const id=Array.isArray(launch)?launch[0].id:launch.id;
 if(!id)throw new Error('Build launch has not returned an ID yet.');
 const build=await BuildQuery.byIdAsync(client,id,{useCache:false});
 fs.writeFileSync(path.join(__dirname,'device-build-status.json'),JSON.stringify(build,null,2));
 const result={id:build.id,status:build.status,distribution:build.distribution,sdkVersion:build.sdkVersion,error:build.error,detailsUrl:`https://expo.dev/accounts/yoforex/projects/expogo/builds/${build.id}`,artifact:build.artifacts?.applicationArchiveUrl};
 console.log(JSON.stringify(result,null,2));
 if(process.argv.includes('--logs'))for(const url of build.logFiles??[]){
   const response=await fetch(url,{signal:AbortSignal.timeout(20000)});
   if(!response.ok)continue;
   const lines=(await response.text()).split('\n').filter(Boolean).map(line=>{try{const row=JSON.parse(line);return row.msg??row.message??'';}catch{return '';}});
   console.log(lines.filter(line=>/Start phase:|Finished.*successfully|Executing build step|Error:|not found|failed|Unknown/i.test(line)).slice(-15).join('\n').replace(/[0-9A-F]{8}-[0-9A-F]{16}/gi,'[device identifier]'));
 }
 if(build.status==='ERRORED')process.exitCode=2;
})().catch(error=>{console.error(error.message);process.exitCode=1;});
