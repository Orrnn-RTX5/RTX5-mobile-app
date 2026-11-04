const path = require('node:path');
const fs = require('node:fs');
const cli = path.resolve(__dirname,'../../tools/js-toolchain/node_modules/eas-cli/build');
const load = file => require(path.join(cli,file));
const {default:SessionManager} = load('user/SessionManager');
const {createGraphqlClient} = load('commandUtils/context/contextUtils/createGraphqlClient');
const {WorkflowRunQuery} = load('graphql/queries/WorkflowRunQuery');
const session = new SessionManager({setActor(){}});
const client = createGraphqlClient({accessToken:session.getAccessToken(),sessionSecret:session.getSessionSecret()});
(async()=>{
  const result = await WorkflowRunQuery.expoGoRepackConfigurationAsync(client,{
    appId:'ba323d63-7e19-41a0-b88e-d20fda074505',ascAppId:'6820412382',appName:'My Expo Go',
    bundleId:'com.yoforex.expogo',sdkVersion:'54.0.0',
  });
  const target=path.resolve(__dirname,'../expo-go54-device');
  fs.mkdirSync(target,{recursive:true});
  for(const file of result.files){
    const dest=path.resolve(target,file.fileName);
    if(!dest.startsWith(target+path.sep))throw new Error('Unexpected generated file path');
    fs.mkdirSync(path.dirname(dest),{recursive:true});
    fs.writeFileSync(dest,file.fileContents);
  }
  console.log(JSON.stringify({sdkVersion:result.sdkVersion,target,files:result.files.map(f=>f.fileName)},null,2));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
