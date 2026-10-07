import type { EnhancedDrawingToolRuntime } from '../types';

export const textLevelEnhancedDrawingToolRuntime: EnhancedDrawingToolRuntime = {
  tool: 'textLevel',
  script: `
  /**
   * Normalizes the style configuration for the drawing tool, providing defaults for missing values.
   */
  function normalizeTextLevelLineStyle(value) {
    return value === 'dashed' || value === 'dotted' ? value : 'solid';
  }

  /**
   * Helper function: normalizeTextLevelExtendMode.
   */
  function normalizeTextLevelExtendMode(value) {
    return value === 'none' || value === 'left' || value === 'both' ? value : 'right';
  }

  /**
   * Helper function: normalizeTextLevelPosition.
   */
  function normalizeTextLevelPosition(value) {
    return value === 'left' || value === 'center' || value === 'anchor' || value === 'price-axis' ? value : 'right';
  }

  /**
   * Helper function: normalizeTextLevelType.
   */
  function normalizeTextLevelType(value) {
    return value === 'entry' ||
      value === 'stopLoss' ||
      value === 'takeProfit' ||
      value === 'support' ||
      value === 'resistance' ||
      value === 'liquidity' ||
      value === 'orderBlock' ||
      value === 'fairValueGap' ||
      value === 'dailyOpen' ||
      value === 'weeklyOpen' ||
      value === 'sessionHigh' ||
      value === 'sessionLow'
      ? value
      : 'neutral';
  }

  /**
   * Helper function: sanitizeTextLevelText.
   */
  function sanitizeTextLevelText(value) {
    var text = typeof value === 'string' ? value : 'Level';
    text = text.replace(/<[^>]*>/g, '').replace(/[\\u0000-\\u001F\\u007F]/g, ' ').replace(/[<>]/g, '').replace(/\\s+/g, ' ').trim();
    if (!text) text = 'Level';
    return text.length > 120 ? text.slice(0, 120) : text;
  }

  /**
   * Helper function: normalizeTextLevelOffset.
   */
  function normalizeTextLevelOffset(value) {
    var source = value && typeof value === 'object' ? value : {};
    return {
      x: isFiniteNumber(source.x) ? Math.max(-240, Math.min(240, source.x)) : 0,
      y: isFiniteNumber(source.y) ? Math.max(-120, Math.min(120, source.y)) : 0
    };
  }

  /**
   * Normalizes the style configuration for the drawing tool, providing defaults for missing values.
   */
  function normalizeTextLevelStyle(style, draft) {
    var source = style && typeof style === 'object' ? style : {};
    return {
      textColor: typeof source.textColor === 'string' ? source.textColor : '#FFFFFF',
      backgroundColor: typeof source.backgroundColor === 'string'
        ? source.backgroundColor
        : (typeof source.labelBackgroundColor === 'string' ? source.labelBackgroundColor : 'rgba(41, 98, 255, 0.90)'),
      borderColor: typeof source.borderColor === 'string' ? source.borderColor : '#2962FF',
      borderWidth: isFiniteNumber(source.borderWidth) ? Math.max(0, Math.min(4, source.borderWidth)) : 1,
      borderRadius: isFiniteNumber(source.borderRadius) ? Math.max(0, Math.min(10, source.borderRadius)) : 4,
      paddingX: isFiniteNumber(source.paddingX) ? Math.max(3, Math.min(14, source.paddingX)) : 6,
      paddingY: isFiniteNumber(source.paddingY) ? Math.max(2, Math.min(10, source.paddingY)) : 3,
      fontSize: isFiniteNumber(source.fontSize) ? Math.max(9, Math.min(18, source.fontSize)) : 12,
      fontFamily: typeof source.fontFamily === 'string' && source.fontFamily ? source.fontFamily : 'Arial, sans-serif',
      fontWeight: source.fontWeight || 700,
      opacity: isFiniteNumber(source.opacity) ? Math.max(0.08, Math.min(1, source.opacity)) : (draft ? 0.72 : 1),
      selectedBorderColor: typeof source.selectedBorderColor === 'string' ? source.selectedBorderColor : '#5B9DFF',
      hoverBorderColor: typeof source.hoverBorderColor === 'string' ? source.hoverBorderColor : '#8AB4FF',
      handleColor: typeof source.handleColor === 'string' ? source.handleColor : '#2962FF',
      handleSize: isFiniteNumber(source.handleSize) ? Math.max(4, Math.min(12, source.handleSize)) : 6,
      showBackground: source.showBackground === false ? false : true,
      showBorder: source.showBorder === false ? false : true,
      showAnchor: source.showAnchor === true,
      align: source.align === 'center' || source.align === 'right' ? source.align : 'left'
    };
  }

  /**
   * Helper function: normalizeTextLevelLine.
   */
  function normalizeTextLevelLine(levelLine) {
    var source = levelLine && typeof levelLine === 'object' ? levelLine : {};
    return {
      enabled: source.enabled === false ? false : true,
      extendMode: normalizeTextLevelExtendMode(source.extendMode),
      lineColor: typeof source.lineColor === 'string' ? source.lineColor : '#2962FF',
      lineWidth: isFiniteNumber(source.lineWidth) ? Math.max(1, Math.min(6, source.lineWidth)) : 1,
      lineStyle: normalizeTextLevelLineStyle(source.lineStyle),
      opacity: isFiniteNumber(source.opacity) ? Math.max(0, Math.min(1, source.opacity)) : 0.9
    };
  }

  /**
   * Helper function: textLevelDashPattern.
   */
  function textLevelDashPattern(style, ratio) {
    var px = Math.max(1, ratio || 1);
    if (style === 'dashed') return [8 * px, 5 * px];
    if (style === 'dotted') return [2 * px, 5 * px];
    return [];
  }

  /**
   * Helper function: normalizeTextLevelRecord.
   */
  function normalizeTextLevelRecord(record, draft) {
    var source = record && typeof record === 'object' ? record : {};
    return {
      type: 'textLevel',
      paneId: typeof source.paneId === 'string' ? source.paneId : 'main',
      text: sanitizeTextLevelText(source.text),
      style: normalizeTextLevelStyle(source.style, draft),
      levelLine: normalizeTextLevelLine(source.levelLine),
      labelPosition: normalizeTextLevelPosition(source.labelPosition),
      labelOffset: normalizeTextLevelOffset(source.labelOffset),
      showPrice: source.showPrice === false ? false : true,
      showPriceAxisLabel: source.showPriceAxisLabel === false ? false : true,
      levelType: normalizeTextLevelType(source.levelType),
      followLastPrice: source.followLastPrice === true,
      alertMetadata: source.alertMetadata && typeof source.alertMetadata === 'object'
        ? cloneSerializable(source.alertMetadata, undefined)
        : undefined,
      locked: !!source.locked,
      visible: source.visible === false || source.hidden === true ? false : true,
      selected: !!source.selected,
      hovered: !!source.hovered,
      draft: !!draft
    };
  }

  /**
   * Helper function: getTextLevelRenderPrice.
   */
  function getTextLevelRenderPrice(source) {
    if (!source._options.followLastPrice) {
      return source._point.price;
    }
    var data = getSeriesData(source.series);
    var last = Array.isArray(data) && data.length ? data[data.length - 1] : null;
    if (last && isFiniteNumber(last.close)) return last.close;
    if (last && isFiniteNumber(last.value)) return last.value;
    return source._point.price;
  }

  /**
   * Helper function: buildTextLevelDisplayText.
   */
  function buildTextLevelDisplayText(source) {
    var text = sanitizeTextLevelText(source._options.text);
    if (source._options.showPrice) {
      return text + ' ' + formatCrosshairPrice(source.series, getTextLevelRenderPrice(source));
    }
    return text;
  }

  /**
   * Helper function: estimateTextLevelLabelSize.
   */
  function estimateTextLevelLabelSize(text, style) {
    var width = Math.max(36, Math.min(240, (String(text).length * style.fontSize * 0.58) + (style.paddingX * 2)));
    var height = Math.max(20, style.fontSize + (style.paddingY * 2) + 2);
    return { width: width, height: height };
  }

  /**
   * Helper function: resolveTextLevelLabelBox.
   */
  function resolveTextLevelLabelBox(anchor, paneWidth, paneHeight, text, options) {
    var style = options.style;
    var offset = options.labelOffset || { x: 0, y: 0 };
    var size = estimateTextLevelLabelSize(text, style);
    var padding = 5;
    var anchorX = isFiniteNumber(anchor.x) ? anchor.x : paneWidth - size.width - padding;
    var anchorY = isFiniteNumber(anchor.y) ? anchor.y : paneHeight / 2;
    var x = anchorX + 10 + offset.x;
    var position = normalizeTextLevelPosition(options.labelPosition);

    if (position === 'left') {
      x = padding + offset.x;
    } else if (position === 'right' || position === 'price-axis') {
      x = paneWidth - size.width - padding + offset.x;
    } else if (position === 'center') {
      x = (paneWidth - size.width) / 2 + offset.x;
    }

    var y = anchorY - (size.height / 2) + offset.y;
    x = Math.max(padding, Math.min(Math.max(padding, paneWidth - size.width - padding), x));
    y = Math.max(padding, Math.min(Math.max(padding, paneHeight - size.height - padding), y));
    return {
      left: x,
      top: y,
      right: x + size.width,
      bottom: y + size.height,
      width: size.width,
      height: size.height
    };
  }

  /**
   * Helper function: resolveTextLevelLineRange.
   */
  function resolveTextLevelLineRange(anchorX, labelBox, paneWidth, extendMode) {
    var mode = normalizeTextLevelExtendMode(extendMode);
    var anchor = isFiniteNumber(anchorX) ? anchorX : (labelBox ? labelBox.left : paneWidth);
    if (mode === 'both') return { left: 0, right: paneWidth };
    if (mode === 'left') return { left: 0, right: Math.max(0, Math.min(paneWidth, anchor)) };
    if (mode === 'right') return { left: Math.max(0, Math.min(paneWidth, anchor)), right: paneWidth };
    var center = labelBox ? (labelBox.left + labelBox.right) / 2 : anchor;
    return {
      left: Math.max(0, center - 36),
      right: Math.min(paneWidth, center + 36)
    };
  }

  /**
   * Creates the visual primitive object that gets rendered on the chart canvas.
   */
  function createTextLevelPrimitive(point, record, draft) {
  /**
   * Helper function: TextLevelPriceAxisView.
   */
    function TextLevelPriceAxisView(source) {
      this._source = source;
      this._pos = null;
    }

  /**
   * Helper function: update.
   */
    TextLevelPriceAxisView.prototype.update = function () {
      var price = getTextLevelRenderPrice(this._source);
      this._pos = this._source.series && typeof this._source.series.priceToCoordinate === 'function'
        ? this._source.series.priceToCoordinate(price)
        : null;
    };
  /**
   * Helper function: coordinate.
   */
    TextLevelPriceAxisView.prototype.coordinate = function () { return this._pos === null ? -1 : this._pos; };
  /**
   * Helper function: visible.
   */
    TextLevelPriceAxisView.prototype.visible = function () {
      return shouldRenderObjectDescriptions(this._source) &&
        this._source._options.visible &&
        this._source._options.showPriceAxisLabel;
    };
  /**
   * Helper function: tickVisible.
   */
    TextLevelPriceAxisView.prototype.tickVisible = function () { return this.visible(); };
  /**
   * Helper function: text.
   */
    TextLevelPriceAxisView.prototype.text = function () { return formatCrosshairPrice(this._source.series, getTextLevelRenderPrice(this._source)); };
  /**
   * Helper function: textColor.
   */
    TextLevelPriceAxisView.prototype.textColor = function () { return this._source._options.style.textColor; };
  /**
   * Helper function: backColor.
   */
    TextLevelPriceAxisView.prototype.backColor = function () { return this._source._options.levelLine.lineColor || this._source._options.style.backgroundColor; };

  /**
   * Helper function: TextLevelPaneRenderer.
   */
    function TextLevelPaneRenderer(source, geometry) {
      this._source = source;
      this._geometry = geometry;
    }

  /**
   * Helper function: draw.
   */
    TextLevelPaneRenderer.prototype.draw = function (target) {
      var source = this._source;
      var geometry = this._geometry;
      if (!source._options.visible || !geometry || !isFiniteNumber(geometry.anchor.y)) return;
      target.useBitmapCoordinateSpace(function (scope) {
        var ctx = scope.context;
        var ratioX = scope.horizontalPixelRatio || 1;
        var ratioY = scope.verticalPixelRatio || 1;
        var paneWidth = ((scope.bitmapSize && scope.bitmapSize.width) || 1) / ratioX;
        var paneHeight = ((scope.bitmapSize && scope.bitmapSize.height) || 1) / ratioY;
        var style = source._options.style;
        var line = source._options.levelLine;
        var displayText = buildTextLevelDisplayText(source);
        var labelBox = resolveTextLevelLabelBox(geometry.anchor, paneWidth, paneHeight, displayText, source._options);
        var lineRange = resolveTextLevelLineRange(geometry.anchor.x, labelBox, paneWidth, line.extendMode);
        var y = Math.max(0, Math.min(paneHeight, geometry.anchor.y));
        source._geometry = {
          anchor: { x: geometry.anchor.x, y: y },
          labelBox: labelBox,
          lineRange: lineRange,
          paneWidth: paneWidth,
          paneHeight: paneHeight
        };

        ctx.save();
        if (ctx.rect && ctx.clip) {
          ctx.beginPath();
          ctx.rect(0, 0, Math.max(1, paneWidth * ratioX), Math.max(1, paneHeight * ratioY));
          ctx.clip();
        }

        if (line.enabled) {
          ctx.globalAlpha = line.opacity * style.opacity;
          ctx.strokeStyle = source._options.selected ? style.selectedBorderColor : (source._options.hovered ? style.hoverBorderColor : line.lineColor);
          ctx.lineWidth = Math.max(1, line.lineWidth * ratioX);
          if (ctx.setLineDash) ctx.setLineDash(textLevelDashPattern(line.lineStyle, ratioX));
          ctx.beginPath();
          ctx.moveTo(Math.round(lineRange.left * ratioX), Math.round(y * ratioY) + 0.5);
          ctx.lineTo(Math.round(lineRange.right * ratioX), Math.round(y * ratioY) + 0.5);
          ctx.stroke();
          if (ctx.setLineDash) ctx.setLineDash([]);
        }

        if (shouldRenderObjectDescriptions(source)) {
          ctx.globalAlpha = style.opacity;
          var x = labelBox.left * ratioX;
          var top = labelBox.top * ratioY;
          var width = labelBox.width * ratioX;
          var height = labelBox.height * ratioY;
          var borderColor = source._options.selected ? style.selectedBorderColor : (source._options.hovered ? style.hoverBorderColor : style.borderColor);
          if (style.showBackground) {
            roundRectPath(ctx, x, top, width, height, style.borderRadius * ratioX);
            ctx.fillStyle = style.backgroundColor;
            ctx.fill();
          }
          if (style.showBorder || source._options.selected || source._options.hovered) {
            roundRectPath(ctx, x, top, width, height, style.borderRadius * ratioX);
            ctx.strokeStyle = borderColor;
            ctx.lineWidth = Math.max(1, style.borderWidth * ratioX);
            ctx.stroke();
          }
          ctx.font = String(style.fontWeight) + ' ' + Math.round(style.fontSize * ratioX) + 'px ' + style.fontFamily;
          ctx.fillStyle = style.textColor;
          ctx.textBaseline = 'middle';
          ctx.textAlign = style.align;
          var textX = x + style.paddingX * ratioX;
          if (style.align === 'center') textX = x + width / 2;
          if (style.align === 'right') textX = x + width - style.paddingX * ratioX;
          ctx.fillText(displayText, textX, top + height / 2, Math.max(8, width - style.paddingX * 2 * ratioX));
        }

        if (style.showAnchor && isFiniteNumber(geometry.anchor.x)) {
          ctx.fillStyle = line.lineColor;
          ctx.beginPath();
          ctx.arc(geometry.anchor.x * ratioX, y * ratioY, 3 * ratioX, 0, Math.PI * 2);
          ctx.fill();
        }

        if (shouldRenderObjectDescriptions(source) && (source._options.selected || source._options.draft)) {
          var handleSize = style.handleSize * ratioX;
          ctx.fillStyle = '#FFFFFF';
          ctx.strokeStyle = style.handleColor;
          ctx.lineWidth = Math.max(1, 1.5 * ratioX);
          ctx.beginPath();
          ctx.arc(labelBox.right * ratioX, (labelBox.top + labelBox.height / 2) * ratioY, handleSize / 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();
      });
    };

  /**
   * Helper function: TextLevelPaneView.
   */
    function TextLevelPaneView(source) {
      this._source = source;
      this._geometry = { anchor: { x: null, y: null } };
    }

  /**
   * Helper function: update.
   */
    TextLevelPaneView.prototype.update = function () {
      var price = getTextLevelRenderPrice(this._source);
      this._geometry = {
        anchor: {
          x: resolveCoordinateFromTime(this._source.chart, this._source.series, this._source._point.time),
          y: this._source.series.priceToCoordinate(price)
        }
      };
      this._source._geometry = Object.assign({}, this._source._geometry || {}, this._geometry);
    };

  /**
   * Helper function: renderer.
   */
    TextLevelPaneView.prototype.renderer = function () {
      return new TextLevelPaneRenderer(this._source, this._geometry);
    };

  /**
   * Helper function: TextLevelPrimitive.
   */
    function TextLevelPrimitive(anchor, opts) {
      PrimitiveBase.call(this);
      this._point = clonePoint(anchor);
      this._options = Object.assign(normalizeTextLevelRecord(opts, draft), { draft: !!draft });
      this._geometry = null;
      this._fallbackPaneSize = null;
      this._labelDragState = null;
      this._paneViews = [new TextLevelPaneView(this)];
      this._priceAxisViews = [new TextLevelPriceAxisView(this)];
    }

    TextLevelPrimitive.prototype = Object.create(PrimitiveBase.prototype);
    TextLevelPrimitive.prototype.constructor = TextLevelPrimitive;
  /**
   * Helper function: updateAllViews.
   */
    TextLevelPrimitive.prototype.updateAllViews = function () {
      this._paneViews.forEach(function (view) { view.update(); });
      this._priceAxisViews.forEach(function (view) { view.update(); });
    };
  /**
   * Helper function: paneViews.
   */
    TextLevelPrimitive.prototype.paneViews = function () { return this._paneViews; };
  /**
   * Helper function: priceAxisViews.
   */
    TextLevelPrimitive.prototype.priceAxisViews = function () { return this._priceAxisViews; };
  /**
   * Helper function: setFallbackPaneSize.
   */
    TextLevelPrimitive.prototype.setFallbackPaneSize = function (width, height) {
      this._fallbackPaneSize = {
        width: isFiniteNumber(width) && width > 0 ? width : null,
        height: isFiniteNumber(height) && height > 0 ? height : null
      };
    };
  /**
   * Helper function: setVisible.
   */
    TextLevelPrimitive.prototype.setVisible = function (visible) {
      this._options.visible = !!visible;
      this.requestUpdate();
    };
  /**
   * Helper function: setSelected.
   */
    TextLevelPrimitive.prototype.setSelected = function (selected) {
      this._options.selected = !!selected;
      this.requestUpdate();
    };
  /**
   * Helper function: setHovered.
   */
    TextLevelPrimitive.prototype.setHovered = function (hovered) {
      this._options.hovered = !!hovered;
      this.requestUpdate();
    };
  /**
   * Helper function: updateText.
   */
    TextLevelPrimitive.prototype.updateText = function (text) {
      this._options.text = sanitizeTextLevelText(text);
      this.requestUpdate();
    };
  /**
   * Helper function: updatePoints.
   */
    TextLevelPrimitive.prototype.updatePoints = function (pointValue) {
      this._point = clonePoint(pointValue);
      this.requestUpdate();
    };
  /**
   * Helper function: beginEdit.
   */
    TextLevelPrimitive.prototype.beginEdit = function (part, startPoint) {
      if (part === 'label') {
        this._labelDragState = {
          key: String(startPoint && startPoint.time) + ':' + String(startPoint && startPoint.price),
          offset: normalizeTextLevelOffset(this._options.labelOffset)
        };
      } else {
        this._labelDragState = null;
      }
    };
  /**
   * Helper function: endEdit.
   */
    TextLevelPrimitive.prototype.endEdit = function (commit) {
      if (this._labelDragState && !commit) {
        this._options.labelOffset = normalizeTextLevelOffset(this._labelDragState.offset);
        this.requestUpdate();
      }
      this._labelDragState = null;
    };
  /**
   * Helper function: getPoints.
   */
    TextLevelPrimitive.prototype.getPoints = function () {
      return clonePoints([this._point]);
    };
  /**
   * Helper function: getSerializableState.
   */
    TextLevelPrimitive.prototype.getSerializableState = function () {
      return {
        labelOffset: normalizeTextLevelOffset(this._options.labelOffset),
        text: sanitizeTextLevelText(this._options.text)
      };
    };
  /**
   * Helper function: getGeometry.
   */
    TextLevelPrimitive.prototype.getGeometry = function () {
      this.updateAllViews();
      var geometry = this._geometry;
      if (!geometry || !geometry.anchor || !isFiniteNumber(geometry.anchor.y)) {
        return null;
      }
      if (!geometry.labelBox) {
        var paneWidth = geometry.paneWidth || (this._fallbackPaneSize && this._fallbackPaneSize.width) || 360;
        var paneHeight = geometry.paneHeight || (this._fallbackPaneSize && this._fallbackPaneSize.height) || 320;
        var text = buildTextLevelDisplayText(this);
        var labelBox = resolveTextLevelLabelBox(geometry.anchor, paneWidth, paneHeight, text, this._options);
        var lineRange = resolveTextLevelLineRange(geometry.anchor.x, labelBox, paneWidth, this._options.levelLine.extendMode);
        geometry = Object.assign({}, geometry, { labelBox: labelBox, lineRange: lineRange, paneWidth: paneWidth, paneHeight: paneHeight });
        this._geometry = geometry;
      }
      return geometry;
    };
  /**
   * Helper function: getTextEditGeometry.
   */
    TextLevelPrimitive.prototype.getTextEditGeometry = function () {
      return this.getGeometry();
    };
  /**
   * Helper function: getTextEditStyle.
   */
    TextLevelPrimitive.prototype.getTextEditStyle = function () {
      var style = this._options.style;
      return {
        background: style.backgroundColor,
        border: Math.max(1, style.borderWidth) + 'px solid ' + style.selectedBorderColor,
        borderRadius: style.borderRadius + 'px',
        color: style.textColor,
        font: String(style.fontWeight) + ' ' + style.fontSize + 'px ' + style.fontFamily,
        lineHeight: Math.max(16, style.fontSize + 4) + 'px',
        padding: style.paddingY + 'px ' + style.paddingX + 'px',
        textAlign: style.align
      };
    };
  /**
   * Helper function: hitTest.
   */
    TextLevelPrimitive.prototype.hitTest = function (pointValue, context) {
      var geometry = this.getGeometry();
      if (!geometry || !pointValue) return null;
      var isTouch = context && context.isTouch;
      var labelPad = isTouch ? 12 : 5;
      var lineThreshold = isTouch ? 14 : 7;
      var label = geometry.labelBox;
      if (shouldRenderObjectDescriptions(this) && label && pointValue.x >= label.left - labelPad && pointValue.x <= label.right + labelPad && pointValue.y >= label.top - labelPad && pointValue.y <= label.bottom + labelPad) {
        return { part: 'label' };
      }
      var lineRange = geometry.lineRange;
      if (this._options.levelLine.enabled && lineRange && pointValue.x >= lineRange.left - labelPad && pointValue.x <= lineRange.right + labelPad && Math.abs(pointValue.y - geometry.anchor.y) <= lineThreshold) {
        return { part: 'line' };
      }
      if (isFiniteNumber(geometry.anchor.x) && Math.abs(pointValue.x - geometry.anchor.x) <= labelPad && Math.abs(pointValue.y - geometry.anchor.y) <= labelPad) {
        return { part: 'anchor' };
      }
      return null;
    };
  /**
   * Helper function: buildEditPoints.
   */
    TextLevelPrimitive.prototype.buildEditPoints = function (part, originalPoints, startPoint, editPoint) {
      if (!Array.isArray(originalPoints) || !originalPoints.length || !editPoint) return null;
      var next = clonePoint(originalPoints[0]);
      if (part === 'label') {
        var dragKey = String(startPoint && startPoint.time) + ':' + String(startPoint && startPoint.price);
        if (!this._labelDragState || this._labelDragState.key !== dragKey) {
          this._labelDragState = {
            key: dragKey,
            offset: normalizeTextLevelOffset(this._options.labelOffset)
          };
        }
        var startX = resolveCoordinateFromTime(this.chart, this.series, startPoint.time);
        var editX = resolveCoordinateFromTime(this.chart, this.series, editPoint.time);
        var startY = this.series && typeof this.series.priceToCoordinate === 'function'
          ? this.series.priceToCoordinate(startPoint.price)
          : null;
        var editY = this.series && typeof this.series.priceToCoordinate === 'function'
          ? this.series.priceToCoordinate(editPoint.price)
          : null;
        var dx = isFiniteNumber(startX) && isFiniteNumber(editX) ? editX - startX : 0;
        var dy = isFiniteNumber(startY) && isFiniteNumber(editY) ? editY - startY : 0;
        // Dragging the label changes its screen offset, not the saved price/time level.
        this._options.labelOffset = normalizeTextLevelOffset({
          x: this._labelDragState.offset.x + dx,
          y: this._labelDragState.offset.y + dy
        });
        this.requestUpdate();
      } else if (part === 'anchor' || !this._options.levelLine.enabled) {
        next = clonePoint(editPoint);
      } else {
        next.price = editPoint.price;
        if (editPoint.paneId !== undefined) next.paneId = editPoint.paneId;
      }
      return [next];
    };
    return new TextLevelPrimitive(point, record);
  }

  /**
   * Helper function: buildTextLevelAlertMetadata.
   */
  function buildTextLevelAlertMetadata(pointValue, levelType) {
    return {
      supportedEvents: [
        'touches-level',
        'crosses-above',
        'crosses-below',
        'closes-above',
        'closes-below'
      ],
      levelType: normalizeTextLevelType(levelType),
      price: pointValue && isFiniteNumber(pointValue.price) ? pointValue.price : undefined,
      time: pointValue ? pointValue.time : undefined
    };
  }

  /**
   * Builds a serialized record object representing the current state of the drawing tool for persistence.
   */
  function buildTextLevelRecord(pointValue, text, style, levelLine, labelPosition, levelType) {
    var now = Date.now();
    var normalizedType = normalizeTextLevelType(levelType);
    return {
      type: 'textLevel',
      paneId: 'main',
      points: clonePoints([pointValue]),
      text: sanitizeTextLevelText(text || 'Level'),
      style: normalizeTextLevelStyle(style, false),
      levelLine: normalizeTextLevelLine(levelLine),
      labelPosition: normalizeTextLevelPosition(labelPosition),
      labelOffset: { x: 0, y: 0 },
      showPrice: true,
      showPriceAxisLabel: true,
      levelType: normalizedType,
      followLastPrice: false,
      alertMetadata: buildTextLevelAlertMetadata(pointValue, normalizedType),
      locked: false,
      selected: true,
      createdAt: now,
      updatedAt: now
    };
  }

  /**
   * Constructor function for the drawing tool class, initializing its state and event listeners.
   */
  function TextLevelTool(chart, series, manager) {
    BaseTool.call(this, 'textLevel', chart, series, manager);
    this._style = normalizeTextLevelStyle(null, false);
    this._levelLine = normalizeTextLevelLine({ enabled: true, extendMode: 'right' });
    this._labelPosition = 'right';
    this._levelType = 'neutral';
    this._handleClick = this._handleClick.bind(this);
    this._usesNativeChartInput = !manager.shouldUseDirectTouchInput();
    if (this._usesNativeChartInput) {
      this._chart.subscribeClick(this._handleClick);
    }
  }

  TextLevelTool.prototype = Object.create(BaseTool.prototype);
  TextLevelTool.prototype.constructor = TextLevelTool;
  /**
   * Handles click events on the chart to process point placement for the drawing tool.
   */
  TextLevelTool.prototype._handleClick = function (param) {
    if (!this._drawing) return;
    var point = this._resolvePoint(param);
    if (!point) return;
    // The only persisted coordinate is logical: time/dataIndex/price. Pixels are recalculated every render.
    var serialized = buildTextLevelRecord(point, 'Level', this._style, this._levelLine, this._labelPosition, this._levelType);
    var chartContext = this._manager && this._manager._crosshairConfig ? this._manager._crosshairConfig : {};
    serialized.symbol = typeof chartContext.symbol === 'string' ? chartContext.symbol : undefined;
    serialized.timeframe = typeof chartContext.timeframe === 'string' ? chartContext.timeframe : undefined;
    serialized.editAfterCreate = true;
    this._completeDrawing(createTextLevelPrimitive(point, serialized, false), 'Text Level', serialized);
  };
  /**
   * Removes the tool and cleans up associated event listeners.
   */
  TextLevelTool.prototype.remove = function () {
    this.stopDrawing();
    if (this._usesNativeChartInput) {
      this._chart.unsubscribeClick(this._handleClick);
    }
  };

  /**
   * Registers this drawing tool with the global drawing manager so it can be instantiated by the chart.
   */
  registerEnhancedDrawingTool({
    kind: 'textLevel',
    defaultLabel: 'Text Level',
    requiredPointCount: 1,
    createTool: function (chart, series, manager) {
      return new TextLevelTool(chart, series, manager);
    },
    createPrimitiveFromRecord: function (record) {
      var points = record.points || [];
      var normalized = normalizeTextLevelRecord(record, false);
      return createTextLevelPrimitive(points[0], Object.assign({}, record, normalized), false);
    }
  });
`,
};
