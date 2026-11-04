(async () => {
  const hook = globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  const rows = [];
  const name = f => typeof f.type === 'string' ? f.type : f.type?.displayName || f.type?.name || f.elementType?.name || String(f.tag);
  const measure = f => new Promise(resolve => {
    const instance = f.stateNode?.canonical?.publicInstance || f.stateNode;
    if (!instance?.measure) return resolve(null);
    const timer = setTimeout(() => resolve({timeout: true}), 1000);
    instance.measure((x,y,width,height,pageX,pageY) => { clearTimeout(timer); resolve({x,y,width,height,pageX,pageY}); });
  });
  const describe = async (f, depth) => {
    const p = f.memoizedProps || {};
    const row = {name:name(f), tag:f.tag, style:p.style, label:p.accessibilityLabel, expanded:p.accessibilityState?.expanded, nativeKeys:Object.keys(f.stateNode || {}), layout:await measure(f)};
    if (typeof p.children === 'string') row.text=p.children;
    if (depth>0) {
      row.children=[];
      for(let child=f.child;child;child=child.sibling) row.children.push(await describe(child,depth-1));
    }
    return row;
  };
  for(const id of hook.renderers.keys()) for(const root of hook.getFiberRoots(id)) {
    const visit = async f => {
      if(!f)return;
      if(f.tag===5 && f.memoizedProps?.accessibilityLabel==='Toggle account summary details') {
        const ancestors=[];
        for(let a=f.return;a && ancestors.length<8;a=a.return) ancestors.push({name:name(a),tag:a.tag,style:a.memoizedProps?.style, layout:await measure(a)});
        rows.push({ancestors,header:await describe(f,5)});
      }
      for(let c=f.child;c;c=c.sibling) await visit(c);
    };
    await visit(root.current);
  }
  return JSON.stringify(rows);
})()
