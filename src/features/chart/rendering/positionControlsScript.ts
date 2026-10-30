/** Runs inside the existing chart document. Values are assigned with textContent. */
export const POSITION_CONTROLS_WEBVIEW_JS = String.raw`
  var positionControlRequestId = 0;
  var positionControlPending = Object.create(null);
  var positionControlModifyPending = Object.create(null);
  var positionControlMutationPending = Object.create(null);
  var positionControlScopedStates = Object.create(null);
  var positionControlDocumentScope = '';
  var positionControlTouchPointers = new Set();
  var positionControlMultitouchUntil = 0;
  window.addEventListener('pointerdown', function(event) {
    if (event.pointerType !== 'touch') return;
    positionControlTouchPointers.add(event.pointerId);
    if (positionControlTouchPointers.size > 1) positionControlMultitouchUntil = Date.now() + 500;
  }, true);
  function releasePositionControlTouch(event) {
    if (positionControlTouchPointers.size > 1) positionControlMultitouchUntil = Date.now() + 500;
    positionControlTouchPointers.delete(event.pointerId);
  }
  window.addEventListener('pointerup', releasePositionControlTouch, true);
  window.addEventListener('pointercancel', releasePositionControlTouch, true);

  function postPositionControlAction(control, action) {
    if (!control || control.dataContextSig !== lastInitDataContextSig || positionControlPending[control.positionKey]
      || positionControlModifyPending[control.positionKey] || positionControlMutationPending[control.positionKey]) return;
    var requestId = ++positionControlRequestId;
    positionControlPending[control.positionKey] = requestId;
    setPositionControlButtonsBusy(control.positionKey, true);
    window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({}, control, {
      type: 'CHART_POSITION_ACTION', action: action, requestId: requestId
    })));
  }
  function setPositionControlButtonsBusy(key, busy) {
    for (var nodeKey in _overlayDomNodesByKey) {
      var node = _overlayDomNodesByKey[nodeKey];
      if (!node || !node._positionControl || node._positionControl.positionKey !== key) continue;
      var buttons = node.querySelectorAll('button');
      for (var i = 0; i < buttons.length; i++) {
        buttons[i].disabled = busy || !!buttons[i]._disabledReason;
        buttons[i].setAttribute('aria-busy', busy ? 'true' : 'false');
      }
      node.style.opacity = busy ? '0.65' : '1';
    }
  }
  function updatePositionControlState(result) {
    if (!result || result.dataContextSig !== lastInitDataContextSig) return false;
    if (result.source === 'modification' || result.source === 'position-mutation') {
      positionControlScopedStates[JSON.stringify([result.sessionScope,result.dataContextSig,result.chartGeneration,result.positionKey,result.source])] = result;
    }
    for (var nodeKey in _overlayDomNodesByKey) {
      var node = _overlayDomNodesByKey[nodeKey];
      var control = node && node._positionControl;
      if (!control || control.positionKey !== result.positionKey || control.chartGeneration !== result.chartGeneration
        || control.sessionScope !== result.sessionScope) continue;
      var pending = positionControlPending[result.positionKey];
      if (result.source === 'modification' || result.source === 'position-mutation') {
        var sourcePending = result.source === 'modification' ? positionControlModifyPending : positionControlMutationPending;
        sourcePending[result.positionKey] = result.state === 'pending';
        setPositionControlButtonsBusy(result.positionKey, !!positionControlModifyPending[result.positionKey] || !!positionControlMutationPending[result.positionKey] || !!pending);
        node.setAttribute('data-modification-state', result.state);
        if (result.message) node.setAttribute('title', result.message);
        continue;
      }
      if (pending && pending !== result.requestId) continue;
      if (result.state === 'pending') positionControlPending[result.positionKey] = result.requestId;
      else delete positionControlPending[result.positionKey];
      setPositionControlButtonsBusy(result.positionKey, result.state === 'pending' || !!positionControlModifyPending[result.positionKey] || !!positionControlMutationPending[result.positionKey]);
      node.setAttribute('data-action-state', result.state);
      if (result.message) node.setAttribute('title', result.message);
      else node.removeAttribute('title');
    }
    return true;
  }
  function resolvePositionControlPaneBounds(minTop) {
    var pane = resolveTradeOverlayPaneBounds();
    if (!pane) return null;
    var headerBottom = typeof minTop === 'number' && isFinite(minTop) ? minTop : pane.top;
    return {top:Math.min(pane.bottom, Math.max(pane.top, headerBottom)), bottom:pane.bottom};
  }
  function installPositionButtonGesture(button) {
    var start = null;
    var moved = false;
    button.addEventListener('pointerdown', function(event) {
      start = { x: event.clientX, y: event.clientY }; moved = false;
      event.stopPropagation();
    });
    button.addEventListener('pointermove', function(event) {
      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) moved = true;
      event.stopPropagation();
    });
    button.addEventListener('pointercancel', function() { start = null; moved = true; });
    button.addEventListener('lostpointercapture', function() { if (start) { start = null; moved = true; } });
    button.addEventListener('pointerup', function(event) { start = null; event.stopPropagation(); });
    button.addEventListener('touchstart', function(event) {
      if (event.touches && event.touches.length > 1) { moved=true; positionControlMultitouchUntil=Date.now()+500; event.stopPropagation(); return; }
      if (window.PointerEvent) { event.stopPropagation(); return; }
      var touch = event.touches && event.touches[0];
      if (touch) start = {x:touch.clientX,y:touch.clientY};
      moved = false; event.stopPropagation();
    }, { passive: true });
    button.addEventListener('touchmove', function(event) {
      if (event.touches && event.touches.length > 1) { moved=true; positionControlMultitouchUntil=Date.now()+500; }
      if (window.PointerEvent) { event.stopPropagation(); return; }
      var touch = event.touches && event.touches[0];
      if (start && touch && Math.hypot(touch.clientX-start.x,touch.clientY-start.y)>8) moved=true;
      event.stopPropagation();
    }, { passive: true });
    button.addEventListener('touchcancel', function() { moved=true; start=null; });
    button.addEventListener('touchend', function(event) { if (!window.PointerEvent) start=null; event.stopPropagation(); }, { passive: true });
    button.addEventListener('click', function(event) {
      event.preventDefault(); event.stopPropagation();
      if (button.disabled || (event.detail !== 0 && (moved || positionControlTouchPointers.size > 1 || Date.now() <= positionControlMultitouchUntil))) { moved = false; return; }
      postPositionControlAction(button.parentNode._positionControl, button._positionAction);
    });
  }
  function resolvePositionControlLayout(item, layer) {
    var metrics = resolvePrimaryPaneMetrics();
    var axis = resolveMarketPriceScaleAxisMetrics(layer);
    var plotRight = axis ? axis.axisLeft : metrics.leftAxisWidth + metrics.paneWidth;
    var width = Math.max(0, plotRight - metrics.leftAxisWidth - 16);
    var scale = Math.max(1, item.positionControl.fontScale || 1);
    var grouped = item.groupPositionIds && item.groupPositionIds.length > 1;
    return {metrics:metrics, width:width, scale:scale, grouped:grouped,
      wide:width >= 660 * scale, compact:width < 430 * scale,
      targetHeight:48 * scale, height:48 * scale};
  }
  function resolvePricePositionControlTops(positions, tops) {
    positions.forEach(function(record) {
      // Controls share the price projection used by their entry line and axis
      // badge. Never cache a screen coordinate or displace a trade to stack it.
      tops[record.index] = record.item.y - resolvePositionControlLayout(record.item).height / 2;
    });
  }
  function renderPositionControl(label, item, top, layer, liveKeys, key) {
    var control = item.positionControl;
    var controlPane = resolvePositionControlPaneBounds(item.labelMinTop);
    var layout = resolvePositionControlLayout(item, layer);
    top = item.y - layout.height / 2;
    // Hide under fixed chrome instead of displaying a different price level.
    var visibility = item.paneVisible === false || (controlPane &&
      (top < controlPane.top || top + layout.height > controlPane.bottom)) ? 'hidden' : 'visible';
    var documentScope = JSON.stringify([control.sessionScope, control.dataContextSig, control.chartGeneration]);
    if (documentScope !== positionControlDocumentScope) {
      positionControlPending = Object.create(null);
      positionControlModifyPending = Object.create(null);
      positionControlMutationPending = Object.create(null);
      for (var statusKey in positionControlScopedStates) {
        var cached = positionControlScopedStates[statusKey];
        if (cached.sessionScope !== control.sessionScope || cached.dataContextSig !== control.dataContextSig || cached.chartGeneration !== control.chartGeneration) delete positionControlScopedStates[statusKey];
      }
      positionControlDocumentScope = documentScope;
    }
    ['modification','position-mutation'].forEach(function(source) {
      var cached = positionControlScopedStates[JSON.stringify([control.sessionScope,control.dataContextSig,control.chartGeneration,control.positionKey,source])];
      if (cached) {
        var pendingMap = source === 'modification' ? positionControlModifyPending : positionControlMutationPending;
        pendingMap[control.positionKey] = cached.state === 'pending';
      }
    });
    label._positionControl = Object.assign({}, control, { groupPositionIds: item.groupPositionIds });
    var metrics = layout.metrics, width = layout.width, scale = layout.scale, height = layout.height;
    var grouped = layout.grouped;
    var actions = grouped ? ['details'] : layout.wide ? ['share', 'add', 'reverse', 'tp', 'sl', 'details', 'close']
      : ['tp', 'sl', 'details', 'close'];
    var signature = actions.join(',');
    if (label._controlsSignature !== signature) {
      label.textContent = '';
      label._controlsSignature = signature;
      actions.forEach(function(action) {
        var button = document.createElement('button');
        button.type = 'button'; button._positionAction = action;
        button.textContent = {share:'Share', add:'Add', reverse:'Reverse', tp:'TP', sl:'SL', close:'×'}[action] || '';
        if (action === 'tp' || action === 'sl') {
          var chip = document.createElement('span'); chip.textContent = action.toUpperCase();
          button.textContent = ''; button.appendChild(chip); button._positionChip = chip;
        }
        if (action === 'details') {
          var side = document.createElement('span'); var value = document.createElement('span');
          side.className = 'rtx5-position-side'; value.className = 'rtx5-position-profit';
          button.appendChild(side); button.appendChild(value);
          label._rtx5SideSpan = side; label._rtx5ValueSpan = value;
        }
        installPositionButtonGesture(button);
        label.appendChild(button);
      });
      // Keeping the surface inside the label lets CSS resize it with live text.
      label._positionSurface = document.createElement('div');
      label.appendChild(label._positionSurface);
    }
    var dark = !lastChartBackgroundColor || !/^#(?:fff(?:fff)?|f[0-9a-f]{5})$/i.test(lastChartBackgroundColor);
    var background = dark ? '#252525' : '#f5f5f5';
    var foreground = dark ? '#e6edf5' : '#202a36';
    var positionTextSize = (10 * scale) + 'px';
    var buttons = label.querySelectorAll('button');
    for (var i = 0; i < buttons.length; i++) {
      var button = buttons[i]; var action = button._positionAction;
      var reason = action === 'tp' || action === 'sl' ? control.modifyDisabledReason : action === 'close' || action === 'add' || action === 'reverse' ? control.tradingDisabledReason : '';
      button._disabledReason = reason;
      button.disabled = !!reason || !!positionControlPending[control.positionKey] || !!positionControlModifyPending[control.positionKey] || !!positionControlMutationPending[control.positionKey];
      button.setAttribute('aria-label', action === 'details' ? item.labelSideText + ' ' + item.labelValueText + '. Position details and actions, ' + control.positionId
        : action === 'close' ? 'Close ' + item.labelSideText + ' position ' + control.positionId
        : action === 'sl' ? 'Modify stop loss for position ' + control.positionId
        : action === 'tp' ? 'Modify take profit for position ' + control.positionId : action + ' position ' + control.positionId);
      if (reason) button.title = reason; else button.removeAttribute('title');
      Object.assign(button.style, {pointerEvents:'auto', touchAction:'none', border:'0', borderRadius:'5px',
        background:'transparent', color:foreground, fontFamily:'inherit', fontSize:positionTextSize,
        fontWeight:action === 'details' || action === 'tp' || action === 'sl' ? '600' : '500',
        minWidth:'48px', minHeight:layout.targetHeight+'px', padding:'0 6px', margin:'0', boxSizing:'border-box', cursor:'pointer',
        opacity: reason ? '0.45' : '1', flex:action === 'details' ? '1 1 auto' : '0 0 auto',
        display:'flex', alignItems:'center', justifyContent:'center', gap:'5px', whiteSpace:'normal',
        flexDirection:'row'});
      if (action === 'details') {
        button.style.flexWrap = 'nowrap'; button.style.justifyContent = 'flex-start'; button.style.minWidth = '0';
        button.style.gap = '3px'; button.style.padding = '0 2px';
        label._rtx5SideSpan.textContent = grouped ? item.groupPositionIds.length + ' positions' : item.labelSideText;
        label._rtx5SideSpan.style.color = item.labelSideColor;
        label._rtx5ValueSpan.textContent = grouped ? 'Select a ticket  ›' : item.labelValueText;
        label._rtx5ValueSpan.style.color = item.labelValueColor;
        label._rtx5SideSpan.style.fontSize = label._rtx5ValueSpan.style.fontSize = positionTextSize;
        label._rtx5SideSpan.style.fontWeight = label._rtx5ValueSpan.style.fontWeight = '600';
        label._rtx5SideSpan.style.whiteSpace = label._rtx5ValueSpan.style.whiteSpace = 'nowrap';
        // Fit actual phone panes without moving TP/SL into a chart-covering row.
        // Full lots/profit remain in the details button's accessible label.
        button.style.overflow = 'hidden';
        label._rtx5SideSpan.style.flexShrink = label._rtx5ValueSpan.style.flexShrink = '1';
        label._rtx5SideSpan.style.minWidth = label._rtx5ValueSpan.style.minWidth = '0';
        label._rtx5SideSpan.style.overflow = label._rtx5ValueSpan.style.overflow = 'hidden';
        label._rtx5SideSpan.style.textOverflow = label._rtx5ValueSpan.style.textOverflow = 'ellipsis';
        label._rtx5SideSpan.style.lineHeight = label._rtx5ValueSpan.style.lineHeight = (13 * scale)+'px';
        label._rtx5SideSpan.style.overflowWrap = label._rtx5ValueSpan.style.overflowWrap = 'normal';
      }
      if (button._positionChip) {
        // Compact visible controls follow the web reference with a small chip gap.
        button.style.justifyContent = 'center';
        button.style.padding = '0';
        button.style.marginRight = action === 'tp' ? '2px' : '0';
        button.style.minWidth = '22px';
        Object.assign(button._positionChip.style, {
        display:'inline-flex', alignItems:'center', justifyContent:'center', height:(16*scale)+'px',
        fontSize:positionTextSize, fontWeight:'600', lineHeight:'1',
        minWidth:'22px', padding:'0 2px', boxSizing:'border-box',
        border:'1px solid ' + (action === 'tp' ? (dark ? '#397e77' : '#80bbb2') : (dark ? '#8b6b36' : '#c7aa74')),
        color:action === 'tp' ? (dark ? '#91d8cb' : '#12665a') : (dark ? '#e4c68b' : '#80581d'),
        borderRadius:'3px', background:action === 'tp' ? (dark ? '#203f3a' : '#e5f4ee') : (dark ? '#3b3020' : '#fbf1dc'), pointerEvents:'none'
        });
      }
      if (action === 'close') {
        button.style.minWidth = '24px'; button.style.padding = '0 4px';
      }
    }
    // Every viewport uses a compact visual strip and transparent 48px targets.
    // Narrow Android/iOS panes must not turn it into a filled 96px panel.
    Object.assign(label.style, {position:'absolute', left:(metrics.leftAxisWidth + 8)+'px', top:top+'px',
      width:grouped ? width+'px' : 'max-content', maxWidth:width+'px',
      height:height+'px', display:'flex', alignItems:'center',
      overflow:'visible', pointerEvents:'none', zIndex:'20', fontFamily:'-apple-system,Roboto,Arial,sans-serif',
      background:'transparent',
      border:'0', borderRadius:'3px', color:foreground, visibility:visibility,
      padding:grouped ? '0' : '0 3px', boxSizing:'border-box', fontVariantNumeric:'tabular-nums'});
    label.setAttribute('data-rtx5-position-control', 'true');
    var visualHeight = 20 * scale;
    Object.assign(label._positionSurface.style, {position:'absolute', left:'0', right:'0',
      top:((height - visualHeight) / 2)+'px', height:visualHeight+'px', boxSizing:'border-box', background:background,
      border:'1px solid ' + (dark ? '#454545' : '#d6d6d6'), borderRadius:'3px', pointerEvents:'none', zIndex:'-1',
      visibility:visibility});
    var lineKey = key + ':connector'; liveKeys.push(lineKey);
    var connector = upsertOverlayDomNode(layer, lineKey, 'rtx5-position-label-connector');
    var centerY = top + height / 2;
    var connectorTop = Math.max(controlPane ? controlPane.top : 0, Math.min(item.y, centerY));
    var connectorBottom = Math.max(connectorTop, item.y, centerY);
    Object.assign(connector.style, {position:'absolute', left:label.style.left, top:connectorTop+'px',
      height:(connectorBottom - connectorTop)+'px', width:'0', borderLeft:'1px solid ' + item.color,
      pointerEvents:'none', opacity:'0.65', visibility:item.paneVisible === false ? 'hidden' : visibility});
  }
`;
