import React, { useState, useEffect } from 'react';
import { Text, TextStyle } from 'react-native';
import { getBrokerTimeDate } from '../../utils/brokerTime';

interface LiveClockProps {
  style?: TextStyle | TextStyle[];
  suffix?: string;
}

export function LiveClock({ style, suffix = '' }: LiveClockProps) {
  const [time, setTime] = useState(getBrokerTimeDate());

  useEffect(() => {
    const timer = setInterval(() => setTime(getBrokerTimeDate()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <Text style={style}>
      {time.toLocaleTimeString('en-US', { hour12: false })}
      {suffix ? ` ${suffix}` : ''}
    </Text>
  );
}
