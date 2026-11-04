const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../../tools/js-toolchain/node_modules/eas-cli/build');
const load=p=>require(path.join(root,p));
const {default:SessionManager}=load('user/SessionManager');
const {createGraphqlClient}=load('commandUtils/context/contextUtils/createGraphqlClient');
const {UpdateQuery}=load('graphql/queries/UpdateQuery');
const session=new SessionManager({setActor(){}});
const client=createGraphqlClient({accessToken:session.getAccessToken(),sessionSecret:session.getSessionSecret()});
const appId='092a58db-dea9-469a-a383-f27300598812';
const summarize=update=>({id:update.id,group:update.group,platform:update.platform,runtimeVersion:update.runtimeVersion,message:update.message,createdAt:update.createdAt,branch:update.branch?.name});
(async()=>{
 const recent=await UpdateQuery.viewUpdateGroupsOnBranchAsync(client,{appId,branchName:'production',offset:0,limit:6});
 console.log(JSON.stringify({recent:recent.flat().map(summarize)},null,2));
 const known=await Promise.allSettled(['01a16d84-72b7-7440-b258-411fba39b5b1','01a16d85-df05-728a-97df-b917d57f1613'].map(updateId=>UpdateQuery.viewByUpdateAsync(client,{updateId})));
 const result={checkedAt:new Date().toISOString(),recent:recent.flat().map(summarize),previous55:known.map(row=>row.status==='fulfilled'?summarize(row.value):{error:row.reason.message}),manifests:[]};
 for(const [platform,runtime]of[['android','30cba83220fc6c92180eed477863c3e3e3087ce6'],['ios','ef38da275b765380037fc377f5c596de31690b7d']]){
  const response=await fetch('https://u.expo.dev/'+appId,{headers:{'expo-platform':platform,'expo-runtime-version':runtime,'expo-channel-name':'production','expo-protocol-version':'1','accept':'multipart/mixed,application/expo+json,application/json'},signal:AbortSignal.timeout(30000)});
  const body=await response.text();
  fs.writeFileSync(path.join(__dirname,`live-${platform}-ota-manifest.txt`),body);
  const id=body.match(/"id"\s*:\s*"([0-9a-f-]+)"/)?.[1];
  result.manifests.push({platform,runtimeVersion:runtime,httpStatus:response.status,contentType:response.headers.get('content-type'),updateId:id});
 }
 fs.writeFileSync(path.join(__dirname,'live-ota-manifest-check.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify(result,null,2));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
