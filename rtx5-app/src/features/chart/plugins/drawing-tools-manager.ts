/**
 * Lightweight-Charts Plugin: Drawing Tools Manager
 * 
 * Orchestrates user-driven charting primitives (Trendlines, Rectangles, VertLines) 
 * by safely listening to canvas click events, resolving price coordinates, and 
 * attaching/detaching the chosen plugins on the fly. Guaranteed to maintain 
 * single-active-tool concurrency.
 */

import {
	IChartApi,
	ISeriesApi,
	MouseEventParams,
	SeriesType,
	Time,
} from 'lightweight-charts';
import { TrendLine, TrendLineOptions } from './trend-line';
import { VertLine, VertLineOptions } from './vertical-line';
import { RectangleDrawingTool } from './rectangle-drawing-tool';

interface Point {
	time: Time;
	price: number;
}

/**
 * Interactive Trend Line Drawing Tool
 * Click two points on the chart to draw a trend line between them.
 */
export class TrendLineDrawingTool {
	private _chart: IChartApi;
	private _series: ISeriesApi<SeriesType>;
	private _options: Partial<TrendLineOptions>;
	private _trendLines: TrendLine[] = [];
	private _points: Point[] = [];
	private _drawing: boolean = false;

	constructor(
		chart: IChartApi,
		series: ISeriesApi<SeriesType>,
		options: Partial<TrendLineOptions> = {}
	) {
		this._chart = chart;
		this._series = series;
		this._options = options;
		this._chart.subscribeClick(this._clickHandler);
	}

	private _clickHandler = (param: MouseEventParams) => {
		if (!this._drawing || !param.point || !param.time) return;
		const price = this._series.coordinateToPrice(param.point.y);
		if (price === null) return;
		this._points.push({ time: param.time, price });
		if (this._points.length >= 2) {
			const tl = new TrendLine(
				this._chart,
				this._series,
				this._points[0],
				this._points[1],
				{
					lineColor: '#3B82F6',
					width: 2,
					showLabels: true,
					labelBackgroundColor: 'rgba(59, 130, 246, 0.85)',
					labelTextColor: '#FFFFFF',
					...this._options,
				}
			);
			this._series.attachPrimitive(tl);
			this._trendLines.push(tl);
			this._points = [];
			this._drawing = false;
		}
	};

	startDrawing() {
		this._drawing = true;
		this._points = [];
	}

	stopDrawing() {
		this._drawing = false;
		this._points = [];
	}

	isDrawing() {
		return this._drawing;
	}

	removeAll() {
		this._trendLines.forEach(tl => {
			try { this._series.detachPrimitive(tl); } catch (e) { }
		});
		this._trendLines = [];
	}

	remove() {
		this._chart.unsubscribeClick(this._clickHandler);
		this.removeAll();
	}
}

/**
 * Interactive Vertical Line Drawing Tool
 * Click a point on the chart to place a vertical line at that time.
 */
export class VertLineDrawingTool {
	private _chart: IChartApi;
	private _series: ISeriesApi<SeriesType>;
	private _options: Partial<VertLineOptions>;
	private _lines: VertLine[] = [];
	private _drawing: boolean = false;

	constructor(
		chart: IChartApi,
		series: ISeriesApi<SeriesType>,
		options: Partial<VertLineOptions> = {}
	) {
		this._chart = chart;
		this._series = series;
		this._options = options;
		this._chart.subscribeClick(this._clickHandler);
	}

	private _clickHandler = (param: MouseEventParams) => {
		if (!this._drawing || !param.time) return;
		const vl = new VertLine(this._chart, this._series, param.time, {
			color: '#F59E0B',
			width: 2,
			showLabel: true,
			labelText: new Date((param.time as number) * 1000).toLocaleTimeString(),
			labelBackgroundColor: '#F59E0B',
			labelTextColor: '#FFFFFF',
			...this._options,
		});
		this._series.attachPrimitive(vl);
		this._lines.push(vl);
		this._drawing = false;
	};

	startDrawing() {
		this._drawing = true;
	}

	stopDrawing() {
		this._drawing = false;
	}

	isDrawing() {
		return this._drawing;
	}

	removeAll() {
		this._lines.forEach(vl => {
			try { this._series.detachPrimitive(vl); } catch (e) { }
		});
		this._lines = [];
	}

	remove() {
		this._chart.unsubscribeClick(this._clickHandler);
		this.removeAll();
	}
}

/**
 * Drawing Tools Manager
 * Manages all drawing tools and ensures only one is active at a time.
 */
export class DrawingToolsManager {
	private _trendLineTool: TrendLineDrawingTool;
	private _rectTool: RectangleDrawingTool;
	private _vertLineTool: VertLineDrawingTool;
	private _activeTool: string = 'crosshair';

	constructor(
		chart: IChartApi,
		series: ISeriesApi<SeriesType>,
		options: { showObjectDescriptions?: boolean } = {}
	) {
		const showObjectDescriptions = options.showObjectDescriptions ?? true;

		this._trendLineTool = new TrendLineDrawingTool(chart, series, {
			showLabels: showObjectDescriptions,
		});
		this._rectTool = new RectangleDrawingTool(chart, series, {
			fillColor: 'rgba(59, 130, 246, 0.25)',
			previewFillColor: 'rgba(59, 130, 246, 0.1)',
			labelColor: '#3B82F6',
			labelTextColor: '#FFFFFF',
			showLabels: showObjectDescriptions,
		});
		this._vertLineTool = new VertLineDrawingTool(chart, series, {
			showLabel: showObjectDescriptions,
		});
	}

	setActiveTool(tool: string) {
		// Stop all tools first
		this._trendLineTool.stopDrawing();
		this._rectTool.stopDrawing();
		this._vertLineTool.stopDrawing();
		this._activeTool = tool;

		// Start the selected tool
		switch (tool) {
			case 'trendline':
				this._trendLineTool.startDrawing();
				break;
			case 'fib': // Rectangle zone for fib-like regions
			case 'brush':
				this._rectTool.startDrawing();
				break;
			case 'measure':
				this._vertLineTool.startDrawing();
				break;
		}
	}

	getActiveTool() {
		return this._activeTool;
	}

	removeAllDrawings() {
		this._trendLineTool.removeAll();
		this._rectTool.remove();
		this._vertLineTool.removeAll();
	}

	remove() {
		this._trendLineTool.remove();
		this._rectTool.remove();
		this._vertLineTool.remove();
	}
}
