const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const cli = path.resolve(__dirname,'../../tools/js-toolchain/node_modules/eas-cli/build');
const load = file => require(path.join(cli,file));
const {default:SessionManager} = load('user/SessionManager');
const {createGraphqlClient} = load('commandUtils/context/contextUtils/createGraphqlClient');
const {getIosAppCredentialsWithCommonFieldsAsync} = load('credentials/ios/api/GraphqlClient');
const {AppStoreConnectApiKeyQuery:KeyMetadata} = load('credentials/ios/api/graphql/queries/AppStoreConnectApiKeyQuery');
const {AppStoreConnectApiKeyQuery:KeyMaterial} = load('graphql/queries/AppStoreConnectApiKeyQuery');
const session = new SessionManager({setActor(){}});
const client = createGraphqlClient({accessToken:session.getAccessToken(),sessionSecret:session.getSessionSecret()});
const account = {id:'ba163f89-ee40-4f58-a1d7-a07e24ec3c5a',name:'yoforex'};
const lookup = {account,projectName:'expogo',bundleIdentifier:'com.yoforex.expogo'};
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
async function checkKey(key) {
  const secret = await KeyMaterial.getByIdAsync(client,key.id);
  const now = Math.floor(Date.now()/1000);
  const content = `${encode({alg:'ES256',kid:secret.keyIdentifier,typ:'JWT'})}.${encode({iss:secret.issuerIdentifier,iat:now-30,exp:now+600,aud:'appstoreconnect-v1'})}`;
  const token = `${content}.${crypto.sign('sha256',Buffer.from(content),{key:secret.keyP8,dsaEncoding:'ieee-p1363'}).toString('base64url')}`;
  const paths = ['/v1/apps/6820412382','/v1/apps?filter%5BbundleId%5D=com.yoforex.expogo&limit=5',
    '/v1/apps?limit=100&fields%5Bapps%5D=name,bundleId,sku',
    '/v1/bundleIds?filter%5Bidentifier%5D=com.yoforex.expogo&limit=5'];
  const checks=[];
  for(const apiPath of paths) {
    const response = await fetch('https://api.appstoreconnect.apple.com'+apiPath,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(25000)});
    const data = await response.json();
    checks.push({path:apiPath,status:response.status,apps:(Array.isArray(data.data)?data.data:data.data?[data.data]:[]).map(app=>({id:app.id,name:app.attributes?.name,bundleId:app.attributes?.bundleId,identifier:app.attributes?.identifier})),errors:data.errors?.map(error=>({code:error.code,title:error.title,detail:error.detail}))});
  }
  return checks;
}
(async()=>{
 const credentials = await getIosAppCredentialsWithCommonFieldsAsync(client,lookup);
 const assigned = credentials?.appStoreConnectApiKeyForSubmissions;
 const keys = await KeyMetadata.getAllForAccountAsync(client,'yoforex');
 console.log(JSON.stringify({credentialId:credentials?.id,buildTeam:credentials?.appleTeam,assignedKeyId:assigned?.id,keys:keys.map(key=>({id:key.id,name:key.name,roles:key.roles,team:key.appleTeam,assigned:key.id===assigned?.id}))},null,2));
 const results=[];
 for(const key of keys.slice(0,6)) {
   try { results.push({id:key.id,name:key.name,team:key.appleTeam,assigned:key.id===assigned?.id,checks:await checkKey(key)}); }
   catch(error) {results.push({id:key.id,error:error.message});}
 }
 const report={checkedAt:new Date().toISOString(),credentialId:credentials?.id,assignedKeyId:assigned?.id,buildTeam:credentials?.appleTeam,results};
 fs.writeFileSync(path.join(__dirname,'apple-access-check.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
