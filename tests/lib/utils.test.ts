/**
 * Unit Tests for utils.ts
 * 
 * Tests the cn (classname) utility function
 */

import { describe, it, expect } from 'vitest';
import { cn } from '../../lib/utils';

describe('cn utility function', () => {
  describe('Basic functionality', () => {
    it('should return empty string for no arguments', () => {
      expect(cn()).toBe('');
    });

    it('should return single class unchanged', () => {
      expect(cn('text-red-500')).toBe('text-red-500');
    });

    it('should combine multiple classes', () => {
      const result = cn('text-red-500', 'bg-blue-500');
      expect(result).toContain('text-red-500');
      expect(result).toContain('bg-blue-500');
    });
  });

  describe('Tailwind merge behavior', () => {
    it('should merge conflicting Tailwind classes (last wins)', () => {
      const result = cn('text-red-500', 'text-blue-500');
      expect(result).toBe('text-blue-500');
    });

    it('should merge padding classes', () => {
      const result = cn('p-4', 'p-8');
      expect(result).toBe('p-8');
    });

    it('should merge margin classes', () => {
      const result = cn('m-2', 'm-4');
      expect(result).toBe('m-4');
    });

    it('should keep non-conflicting classes', () => {
      const result = cn('text-red-500', 'bg-blue-500', 'p-4');
      expect(result).toContain('text-red-500');
      expect(result).toContain('bg-blue-500');
      expect(result).toContain('p-4');
    });
  });

  describe('Conditional classes', () => {
    it('should handle boolean conditions', () => {
      const isActive = true;
      const result = cn('base-class', isActive && 'active-class');
      expect(result).toContain('base-class');
      expect(result).toContain('active-class');
    });

    it('should filter out false values', () => {
      const isActive = false;
      const result = cn('base-class', isActive && 'active-class');
      expect(result).toBe('base-class');
      expect(result).not.toContain('active-class');
    });

    it('should handle undefined values', () => {
      const maybeClass: string | undefined = undefined;
      const result = cn('base-class', maybeClass);
      expect(result).toBe('base-class');
    });

    it('should handle null values', () => {
      const maybeClass: string | null = null;
      const result = cn('base-class', maybeClass);
      expect(result).toBe('base-class');
    });
  });

  describe('Object syntax', () => {
    it('should handle object with boolean values', () => {
      const result = cn({
        'base-class': true,
        'active-class': true,
        'disabled-class': false,
      });
      expect(result).toContain('base-class');
      expect(result).toContain('active-class');
      expect(result).not.toContain('disabled-class');
    });

    it('should combine objects and strings', () => {
      const result = cn('string-class', { 'object-class': true });
      expect(result).toContain('string-class');
      expect(result).toContain('object-class');
    });
  });

  describe('Array syntax', () => {
    it('should handle arrays of classes', () => {
      const result = cn(['class-a', 'class-b']);
      expect(result).toContain('class-a');
      expect(result).toContain('class-b');
    });

    it('should handle nested arrays', () => {
      const result = cn(['class-a', ['class-b', 'class-c']]);
      expect(result).toContain('class-a');
      expect(result).toContain('class-b');
      expect(result).toContain('class-c');
    });
  });

  describe('Real-world usage patterns', () => {
    it('should handle typical component class pattern', () => {
      const isPlaying = true;
      const hasError = false;
      
      const result = cn(
        'flex items-center gap-2',
        'text-sm font-medium',
        isPlaying && 'text-blue-500',
        hasError && 'text-red-500'
      );
      
      expect(result).toContain('flex');
      expect(result).toContain('items-center');
      expect(result).toContain('text-blue-500');
      expect(result).not.toContain('text-red-500');
    });

    it('should handle button variant pattern', () => {
      const variant = 'primary';
      
      const result = cn(
        'px-4 py-2 rounded-lg font-medium',
        variant === 'primary' && 'bg-blue-500 text-white',
        variant === 'secondary' && 'bg-gray-200 text-gray-800'
      );
      
      expect(result).toContain('bg-blue-500');
      expect(result).toContain('text-white');
      expect(result).not.toContain('bg-gray-200');
    });
  });
});
