import { describe, expect, it } from 'vitest';
import { selectJsonInText } from '../../src/utils.js';

describe('selectJsonInText', () => {
  it('should return the json in text', () => {
    const text = '{"foo": "bar"}';
    const result = selectJsonInText(text);
    expect(result).toBe('{"foo": "bar"}');
  });
  it('should return the json in text with multiple json objects', () => {
    const text = '{"foo": "bar"} {"baz": "qux"}';
    const result = selectJsonInText(text);
    expect(result).toBe('{"foo": "bar"}');
  });
  it('should return the json in text with multiple json objects and other text', () => {
    const text = 'This is your JSON: {"foo": "bar"} {"baz": "qux"}';
    const result = selectJsonInText(text);
    expect(result).toBe('{"foo": "bar"}');
  });
  it('should not return broken json', () => {
    const text = 'This is your JSON: {"foo": "bar"';
    const result = selectJsonInText(text);
    expect(result).toBe('');
  });
});
