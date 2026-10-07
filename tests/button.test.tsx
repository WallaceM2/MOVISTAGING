import React from 'react';
import { describe, expect, it, jest } from '@jest/globals';
import { render, fireEvent } from '@testing-library/react-native';
import { Button } from '@/components/Button';

describe('Button', () => {
  it('renderiza e chama onPress', () => {
    const onPress = jest.fn();
    const { getByRole } = render(<Button title="Continuar" onPress={onPress} />);
    fireEvent.press(getByRole('button', { name: 'Continuar' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('desabilita durante loading', () => {
    const onPress = jest.fn();
    const { getByRole } = render(<Button title="Enviar" onPress={onPress} loading />);
    expect(getByRole('button').props.accessibilityState).toEqual({ disabled: true, busy: true });
  });
});
