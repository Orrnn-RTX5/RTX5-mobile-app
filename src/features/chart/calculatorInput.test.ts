import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveCalculatorPriceStep, stepCalculatorInput } from './calculatorInput';

test('calculator price buttons follow broker tick size and supported precision', () => {
  assert.equal(resolveCalculatorPriceStep({ tickSize: 0.25, point: 0.01, digits: 2 }), 0.25);
  assert.equal(resolveCalculatorPriceStep({ point: 0.001 }), 0.001);
  assert.equal(resolveCalculatorPriceStep({ digits: 5 }), 0.00001);
  assert.equal(resolveCalculatorPriceStep(undefined), undefined);
  assert.equal(stepCalculatorInput('', 1, 0.25, 2300.5), '2300.75');
  assert.equal(stepCalculatorInput('1,25000', -1, 0.00001), '1.24999');
  assert.equal(stepCalculatorInput('0.1', 1, 0.1), '0.2');
  assert.equal(stepCalculatorInput('0.01', -1, 0.01), '0.01');
});

test('volume buttons respect min/max limits and malformed input is not sent as a partial number', () => {
  assert.equal(stepCalculatorInput('0.001', -1, 0.001, undefined, 0.001, 1), '0.001');
  assert.equal(stepCalculatorInput('1', 1, 0.001, undefined, 0.001, 1), '1.000');
  assert.equal(stepCalculatorInput('1.25oops', 1, 0.01, 2), undefined);
  assert.equal(stepCalculatorInput('Infinity', 1, 0.01), undefined);
  assert.equal(stepCalculatorInput('', 1, undefined, 2), undefined);
});
