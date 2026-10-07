import React from 'react';
import { jest } from '@jest/globals';

jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK: 'AFTER_FIRST_UNLOCK',
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

jest.mock('@rnmapbox/maps', () => ({
  setAccessToken: jest.fn(),
  StyleURL: { Street: 'mapbox://styles/mapbox/streets-v12' },
  MapView: ({ children }: { children?: React.ReactNode }) => children,
  Camera: () => null,
  UserLocation: () => null,
  PointAnnotation: () => null,
  ShapeSource: ({ children }: { children?: React.ReactNode }) => children,
  LineLayer: () => null,
}));