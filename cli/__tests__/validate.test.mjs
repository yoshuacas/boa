import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateStackName, validateRegion } from '../commands/init.mjs';

describe('validateStackName', () => {
  it('accepts "my-app"', () => {
    assert.equal(validateStackName('my-app'), true);
  });

  it('accepts "test123"', () => {
    assert.equal(validateStackName('test123'), true);
  });

  it('accepts "a"', () => {
    assert.equal(validateStackName('a'), true);
  });

  it('accepts "my-app-v2"', () => {
    assert.equal(validateStackName('my-app-v2'), true);
  });

  it('rejects "My_App" (uppercase and underscore)', () => {
    const result = validateStackName('My_App');
    assert.equal(result, false,
      'should reject names with uppercase or underscores');
  });

  it('rejects "test app" (space)', () => {
    assert.equal(validateStackName('test app'), false);
  });

  it('rejects "test@app" (special char)', () => {
    assert.equal(validateStackName('test@app'), false);
  });

  it('rejects "" (empty string)', () => {
    assert.equal(validateStackName(''), false);
  });

  it('rejects "MY-APP" (uppercase)', () => {
    assert.equal(validateStackName('MY-APP'), false);
  });
});

describe('validateRegion', () => {
  it('accepts "us-east-1"', () => {
    assert.equal(validateRegion('us-east-1'), true);
  });

  it('accepts "us-east-2"', () => {
    assert.equal(validateRegion('us-east-2'), true);
  });

  it('rejects "eu-west-1"', () => {
    assert.equal(validateRegion('eu-west-1'), false);
  });

  it('rejects "ap-southeast-1"', () => {
    assert.equal(validateRegion('ap-southeast-1'), false);
  });

  it('rejects "" (empty string)', () => {
    assert.equal(validateRegion(''), false);
  });
});
