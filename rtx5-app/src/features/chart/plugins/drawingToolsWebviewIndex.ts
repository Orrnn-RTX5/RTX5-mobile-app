import { DrawingToolsManager } from './drawing-tools-manager';

// Expose globally so the React Native WebView HTML can instantiate it
(window as any).DrawingToolsManager = DrawingToolsManager;
