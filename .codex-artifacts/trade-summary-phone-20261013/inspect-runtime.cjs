const fs = require('node:fs');

(async () => {
  const targets = await fetch('http://127.0.0.1:8081/json/list').then(r => r.json());
  const expression = fs.readFileSync(process.argv[2], 'utf8');
  const selected = process.argv[3] ? targets.filter(t => t.id.endsWith(process.argv[3])) : targets;
  await Promise.all(selected.map(target => new Promise(resolve => {
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    const timeout = setTimeout(() => { socket.close(); console.log(JSON.stringify({id: target.id, timeout: true})); resolve(); }, 15000);
    socket.addEventListener('open', () => socket.send(JSON.stringify({id: 1, method: 'Runtime.evaluate', params: {expression, returnByValue: true, awaitPromise: true}})));
    socket.addEventListener('message', event => {
      const data = JSON.parse(event.data);
      if (data.id !== 1) return;
      console.log(JSON.stringify({id: target.id, response: data}));
      clearTimeout(timeout); socket.close(); resolve();
    });
    socket.addEventListener('error', error => { clearTimeout(timeout); console.log(JSON.stringify({id:target.id,error:String(error)})); socket.close(); resolve(); });
  })));
})();
