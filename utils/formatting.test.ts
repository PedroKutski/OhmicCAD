import test from 'node:test';
import assert from 'node:assert/strict';
import { formatUnit } from './formatting.js';

test('formats SI edge values with expected prefixes', () => {
  assert.equal(formatUnit(1e-13, 'F'), '100 fF');
  assert.equal(formatUnit(5e-12, 'F'), '5 pF');
  assert.equal(formatUnit(2e-9, 'F'), '2 nF');
  assert.equal(formatUnit(0.002, 'A'), '2 mA');
  assert.equal(formatUnit(1500, 'Hz'), '1.5 kHz');
});

test('respects boundaries without overlapping conditions', () => {
  assert.equal(formatUnit(1e-12, 'F'), '1 pF');
  assert.equal(formatUnit(1e-9, 'F'), '1 nF');
  assert.equal(formatUnit(1e-6, 'F'), '1 µF');
  assert.equal(formatUnit(1e-3, 'F'), '1 mF');
  assert.equal(formatUnit(1, 'F'), '1 F');
  assert.equal(formatUnit(1000, 'F'), '1 kF');
});

test('rounds near zero to 0 with base unit floor', () => {
  assert.equal(formatUnit(1e-16, 'A'), '0 A');
  assert.equal(formatUnit(-1e-16, 'A'), '0 A');
});
