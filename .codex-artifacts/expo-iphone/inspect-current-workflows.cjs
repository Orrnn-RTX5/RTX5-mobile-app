const path = require('node:path');
const fs = require('node:fs');
const cli = path.resolve(__dirname, '../../tools/js-toolchain/node_modules/eas-cli/build');
const { default: SessionManager } = require(path.join(cli, 'user/SessionManager'));
const { createGraphqlClient } = require(path.join(cli, 'commandUtils/context/contextUtils/createGraphqlClient'));
const { AppQuery } = require(path.join(cli, 'graphql/queries/AppQuery'));
const { WorkflowRunQuery } = require(path.join(cli, 'graphql/queries/WorkflowRunQuery'));
const session = new SessionManager({ setActor() {} });
const client = createGraphqlClient({ accessToken: session.getAccessToken(), sessionSecret: session.getSessionSecret() });
(async () => {
  const runs = await AppQuery.byIdWorkflowRunsFilteredByStatusAsync(client, 'ba323d63-7e19-41a0-b88e-d20fda074505', undefined, 6);
  const summaries = runs.map(run => ({id:run.id,status:run.status,createdAt:run.createdAt}));
  console.log(JSON.stringify(summaries,null,2));
  const latest = await WorkflowRunQuery.withJobsByIdAsync(client, runs[0].id, {useCache:false});
  fs.writeFileSync(path.join(__dirname,'current-workflow.json'), JSON.stringify(latest,null,2));
  console.log(JSON.stringify({id:latest.id,status:latest.status,jobs:latest.jobs.map(job=>({id:job.id,key:job.key,status:job.status,outputs:job.outputs,buildId:job.turtleBuild?.id}))},null,2));
})().catch(error => { console.error(error.message); process.exitCode=1; });
