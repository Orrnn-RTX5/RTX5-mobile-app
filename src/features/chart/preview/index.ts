import { Platform } from 'react-native';

const LiveChartPreview = Platform.OS === 'web' 
  ? require('./LiveChartPreview.web').default 
  : require('./LiveChartPreview.native').default;

export { LiveChartPreview };
