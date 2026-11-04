const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../../tools/js-toolchain/node_modules/eas-cli/build');
const load=p=>require(path.join(root,p));
const {default:SessionManager}=load('user/SessionManager');
const {createGraphqlClient}=load('commandUtils/context/contextUtils/createGraphqlClient');
const {BuildQuery}=load('graphql/queries/BuildQuery');
const {ChannelQuery}=load('graphql/queries/ChannelQuery');
const {BranchQuery}=load('graphql/queries/BranchQuery');
const {UpdateQuery}=load('graphql/queries/UpdateQuery');
const session=new SessionManager({setActor(){}});
const client=createGraphqlClient({accessToken:session.getAccessToken(),sessionSecret:session.getSessionSecret()});
const appId='092a58db-dea9-469a-a383-f27300598812';
(async()=>{
 const [channel,builds,expoGo]=await Promise.all([
   ChannelQuery.viewUpdateChannelAsync(client,{appId,channelName:'production'}),
   BuildQuery.viewBuildsOnAppAsync(client,{appId,limit:30,offset:0,filter:{status:'FINISHED'}}),
   BuildQuery.byIdAsync(client,'0c7a3acb-b975-428d-aedb-6c2c27088346',{useCache:false})
 ]);
 const report={checkedAt:new Date().toISOString(),channel:{name:channel.name,isPaused:channel.isPaused,branchMapping:channel.branchMapping,branches:channel.updateBranches.map(branch=>({name:branch.name,id:branch.id}))},expoGo:{id:expoGo.id,sdkVersion:expoGo.sdkVersion,projectId:expoGo.project.id,runtimeVersion:expoGo.runtimeVersion,channel:expoGo.channel},builds:[],compatibility:[]};
 report.builds=builds.map(build=>({id:build.id,platform:build.platform,sdkVersion:build.sdkVersion,nativeVersion:build.appVersion,buildNumber:build.appBuildVersion,runtimeVersion:build.runtimeVersion,channel:build.channel,profile:build.buildProfile,distribution:build.distribution,createdAt:build.createdAt}));
 const groups=new Map();
 for(const build of report.builds.filter(build=>build.channel==='production'&&build.runtimeVersion)){
  const key=build.platform+':'+build.runtimeVersion;
  if(!groups.has(key))groups.set(key,build);
 }
 for(const build of groups.values())for(const branch of report.channel.branches){
  const id=await BranchQuery.getLatestUpdateIdOnBranchAsync(client,{appId,branchName:branch.name,platform:build.platform,runtimeVersion:build.runtimeVersion});
  const update=id?await UpdateQuery.viewByUpdateAsync(client,{updateId:id}):null;
  let manifest={};
  if(update?.manifestFragment)try{manifest=typeof update.manifestFragment==='string'?JSON.parse(update.manifestFragment):update.manifestFragment;}catch{}
  report.compatibility.push({platform:build.platform,nativeVersion:build.nativeVersion,buildNumber:build.buildNumber,buildId:build.id,runtimeVersion:build.runtimeVersion,branch:branch.name,hasCompatibleOTA:Boolean(update),update:update?{id:update.id,group:update.group,createdAt:update.createdAt,message:update.message,runtimeVersion:update.runtimeVersion,platform:update.platform,manifestAppVersion:manifest.extra?.expoClient?.version??manifest.version}:null});
 }
 fs.writeFileSync(path.join(__dirname,'ota-compatibility-check.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
