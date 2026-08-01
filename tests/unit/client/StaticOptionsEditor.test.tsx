// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { StaticOptionsEditor } from '../../../client/src/components/builder/cards/StaticOptionsEditor';
import type { ChoiceOption } from '@shared/types/stepConfigs';

describe('StaticOptionsEditor', () => {
    it('links alias and label for new options', () => {
        const options: ChoiceOption[] = [
            { id: 'opt1', label: 'Option 1', alias: 'Option 1' }
        ];
        const onUpdate = vi.fn();
        render(<StaticOptionsEditor options={options} onUpdate={onUpdate} onDelete={vi.fn()} onAdd={vi.fn()} />);

        const inputs = screen.getAllByRole('textbox');
        const labelInput = inputs[0];

        fireEvent.change(labelInput, { target: { value: 'Blue' } });

        // Since it's linked (alias == label initially), it should update both label and alias
        expect(onUpdate).toHaveBeenCalledWith(0, { label: 'Blue', alias: 'Blue' });
    });

    it('leaves the alias unchanged if it was overridden', () => {
        const options: ChoiceOption[] = [
            { id: 'opt1', label: 'Navy', alias: 'blue_v2' }
        ];
        const onUpdate = vi.fn();
        render(<StaticOptionsEditor options={options} onUpdate={onUpdate} onDelete={vi.fn()} onAdd={vi.fn()} />);

        const inputs = screen.getAllByRole('textbox');
        const labelInput = inputs[0];

        fireEvent.change(labelInput, { target: { value: 'Dark Navy' } });

        // Alias should not be included in updates
        expect(onUpdate).toHaveBeenCalledWith(0, { label: 'Dark Navy' });
    });

    it('keeps link intact when label edit is made on a newly linked option', () => {
        const options: ChoiceOption[] = [
            { id: 'opt1', label: 'B', alias: 'B' }
        ];
        const onUpdate = vi.fn();
        render(<StaticOptionsEditor options={options} onUpdate={onUpdate} onDelete={vi.fn()} onAdd={vi.fn()} />);

        const inputs = screen.getAllByRole('textbox');
        const labelInput = inputs[0];

        fireEvent.change(labelInput, { target: { value: 'B2' } });

        expect(onUpdate).toHaveBeenCalledWith(0, { label: 'B2', alias: 'B2' });
    });
});
