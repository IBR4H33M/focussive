import React, { useState, useEffect } from 'react';
import { Image, View, StyleSheet, ViewStyle } from 'react-native';

const FRAMES = [
  require('../../assets/loadingframes/frame1.png'),
  require('../../assets/loadingframes/frame2.png'),
  require('../../assets/loadingframes/frame3.png'),
];

export type SpinnerVariant = 'assembly' | 'sequential' | 'fast';

interface LoadingSpinnerProps {
  size?: number;
  variant?: SpinnerVariant;
  speedMs?: number;
  style?: ViewStyle;
}

const SEQUENCES: Record<SpinnerVariant, { frames: number[]; defaultSpeed: number }> = {
  // 1 -> 3 -> 2 -> 3 (Assembly ping-pong: 1 > 3 > 2)
  assembly: {
    frames: [0, 2, 1, 2],
    defaultSpeed: 250,
  },
  // 1 -> 2 -> 3 (Frame 1, Frame 2, Both connected)
  sequential: {
    frames: [0, 1, 2],
    defaultSpeed: 280,
  },
  // 1 -> 2 -> 3 fast spin
  fast: {
    frames: [0, 1, 2],
    defaultSpeed: 160,
  },
};

export function LoadingSpinner({
  size = 56,
  variant = 'assembly',
  speedMs,
  style,
}: LoadingSpinnerProps) {
  const config = SEQUENCES[variant] || SEQUENCES.assembly;
  const speed = speedMs ?? config.defaultSpeed;
  const sequence = config.frames;

  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % sequence.length);
    }, speed);
    return () => clearInterval(timer);
  }, [speed, sequence.length]);

  return (
    <View style={[styles.container, { width: size, height: size }, style]}>
      <Image
        source={FRAMES[sequence[index]]}
        style={{ width: size, height: size }}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
