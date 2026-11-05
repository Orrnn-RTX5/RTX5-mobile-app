/**
 * Chart Feature: Platform Router
 * 
 * Conditionally exports the appropriate ChartScreen implementation based on 
 * the compilation platform (web vs. native) to handle Skia/HTML5 canvas differences.
 */

import type { ComponentType } from 'react';
import { Platform } from 'react-native';

const chartModule =
  Platform.OS === 'web'
    ? require('./ChartScreen.web')
    : require('./ChartScreen.native');

export const ChartScreen = chartModule.ChartScreen as ComponentType;
