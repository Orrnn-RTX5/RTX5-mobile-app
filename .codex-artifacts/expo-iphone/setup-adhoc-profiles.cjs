const path=require('node:path'),fs=require('node:fs'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../../tools/js-toolchain/node_modules/eas-cli/build');
const load=p=>require(path.join(root,p));
const {default:SessionManager}=load('user/SessionManager');
const {createGraphqlClient}=load('commandUtils/context/contextUtils/createGraphqlClient');
const ios=load('credentials/ios/api/GraphqlClient');
const {AppStoreConnectApiKeyQuery}=load('graphql/queries/AppStoreConnectApiKeyQuery');
const {IosDistributionType}=load('graphql/generated');
const session=new SessionManager({setActor(){}});
const client=createGraphqlClient({accessToken:session.getAccessToken(),sessionSecret:session.getSessionSecret()});
const account={id:'ba163f89-ee40-4f58-a1d7-a07e24ec3c5a',name:'yoforex'};
const lookupFor=bundleIdentifier=>({account,projectName:'expogo',bundleIdentifier});
const encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
const reportPath=path.join(__dirname,'adhoc-profile-setup.json');
(async()=>{
 const phone=JSON.parse(fs.readFileSync(path.join(__dirname,'registered-connected-iphone.json'),'utf8'));
 const primary=await ios.getIosAppCredentialsWithCommonFieldsAsync(client,lookupFor('com.yoforex.expogo'));
 const key=await AppStoreConnectApiKeyQuery.getByIdAsync(client,primary.appStoreConnectApiKeyForSubmissions.id);
 const now=Math.floor(Date.now()/1000);
 const unsigned=`${encode({alg:'ES256',kid:key.keyIdentifier,typ:'JWT'})}.${encode({iss:key.issuerIdentifier,iat:now-30,exp:now+900,aud:'appstoreconnect-v1'})}`;
 const token=`${unsigned}.${crypto.sign('sha256',Buffer.from(unsigned),{key:key.keyP8,dsaEncoding:'ieee-p1363'}).toString('base64url')}`;
 async function apple(url,method='GET',body){
   const response=await fetch('https://api.appstoreconnect.apple.com'+url,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});
   const json=await response.json();
   if(!response.ok)throw new Error(`Apple ${method} ${url.split('?')[0]}: ${response.status} ${json.errors?.map(e=>e.detail||e.title).join('; ')}`);
   return json;
 }
 let device=(await apple('/v1/devices?filter%5Budid%5D='+encodeURIComponent(phone.identifier))).data.find(row=>row.attributes.udid.replace(/-/g,'').toUpperCase()===phone.identifier.replace(/-/g,'').toUpperCase());
 if(!device)device=(await apple('/v1/devices','POST',{data:{type:'devices',attributes:{name:'Connected iPhone',platform:'IOS',udid:phone.identifier}}})).data;
 console.log(JSON.stringify({appleDeviceRegistered:true,status:device.attributes.status,identifierSuffix:phone.identifier.slice(-4)}));
 if(device.attributes.status!=='ENABLED')throw new Error('Apple has not enabled this iPhone for provisioning yet.');
 const checkpoint=fs.existsSync(reportPath)?JSON.parse(fs.readFileSync(reportPath,'utf8')):{deviceSuffix:phone.identifier.slice(-4),profiles:[]};
 for(const bundleIdentifier of ['com.yoforex.expogo','com.yoforex.expogo.ExpoNotificationServiceExtension']){
   const lookup=lookupFor(bundleIdentifier);
   const credentials=await ios.getIosAppCredentialsWithCommonFieldsAsync(client,lookup);
   if(!credentials||credentials.appleTeam.appleTeamIdentifier!=='FGVWUQA882')throw new Error('Signing team mismatch.');
   const existing=credentials.iosAppBuildCredentialsList.find(row=>row.distributionCertificate&&new Date(row.distributionCertificate.validityNotAfter)>new Date());
   const certificate=existing?.distributionCertificate;
   if(!certificate)throw new Error('No valid existing signing certificate is available.');
   const verifiedCertificate=(await apple('/v1/certificates/'+certificate.developerPortalIdentifier)).data;
   if(verifiedCertificate.attributes.serialNumber.toUpperCase()!==certificate.serialNumber.toUpperCase())throw new Error('Signing certificate identity mismatch.');
   const bundles=(await apple('/v1/bundleIds?filter%5Bidentifier%5D='+encodeURIComponent(bundleIdentifier))).data;
   const bundle=bundles.find(row=>row.attributes.identifier===bundleIdentifier);
   if(!bundle)throw new Error('Missing Apple bundle identifier: '+bundleIdentifier);
   const name='ExpoGo54-Connected-iPhone-'+phone.identifier.slice(-4)+(bundleIdentifier.endsWith('Extension')?'-Extension':'-Main');
   const candidates=(await apple('/v1/profiles?filter%5Bname%5D='+encodeURIComponent(name))).data;
   let profile=candidates.find(row=>row.attributes.name===name&&row.attributes.profileState==='ACTIVE'&&row.attributes.profileType==='IOS_APP_ADHOC');
   if(!profile)profile=(await apple('/v1/profiles','POST',{data:{type:'profiles',attributes:{name,profileType:'IOS_APP_ADHOC'},relationships:{bundleId:{data:{type:'bundleIds',id:bundle.id}},certificates:{data:[{type:'certificates',id:certificate.developerPortalIdentifier}]},devices:{data:[{type:'devices',id:device.id}]}}}})).data;
   const includedDevices=(await apple('/v1/profiles/'+profile.id+'/devices')).data;
   if(!includedDevices.some(row=>row.id===device.id))throw new Error('Provisioning profile does not include the connected iPhone.');
   let saved=credentials.iosAppBuildCredentialsList.find(row=>row.iosDistributionType===IosDistributionType.AdHoc&&row.provisioningProfile?.developerPortalIdentifier===profile.id)?.provisioningProfile;
   if(!saved)saved=await ios.createProvisioningProfileAsync(client,lookup,credentials.appleAppIdentifier,{appleProvisioningProfile:profile.attributes.profileContent,developerPortalIdentifier:profile.id});
   await ios.createOrUpdateIosAppBuildCredentialsAsync(client,lookup,{appleTeam:credentials.appleTeam,appleAppIdentifierId:credentials.appleAppIdentifier.id,iosDistributionType:IosDistributionType.AdHoc,appleProvisioningProfileId:saved.id,appleDistributionCertificateId:certificate.id});
   const evidence={bundleIdentifier,profileId:profile.id,name:profile.attributes.name,expirationDate:profile.attributes.expirationDate,deviceIncluded:true};
   checkpoint.profiles=checkpoint.profiles.filter(row=>row.bundleIdentifier!==bundleIdentifier).concat(evidence);
   fs.writeFileSync(reportPath,JSON.stringify(checkpoint,null,2));
   console.log(JSON.stringify(evidence));
 }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
