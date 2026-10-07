import { Ionicons } from '@expo/vector-icons';
import React, { memo } from 'react';

// Use one balanced glyph size across headers; the parent retains its full tap area.
export const AppMenuIcon = memo(function AppMenuIcon({ color }: { color: string }) {
  return <Ionicons name="menu-outline" size={22} color={color} allowFontScaling={false} />;
});
