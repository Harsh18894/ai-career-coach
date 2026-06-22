import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Compass } from 'lucide-react';
import QuickOptions, { type QuickOption } from './QuickOptions';

const OPTIONS: QuickOption[] = [
  { label: 'Grow in the same role/organisation', value: "I'd like to grow in my current role." },
  { label: 'Make a job switch' }, // no `value` — label itself is what gets sent
];

describe('QuickOptions', () => {
  it('renders the prompt and every option label, plus a "Something else" entry', () => {
    render(<QuickOptions icon={Compass} prompt="What are you looking for?" options={OPTIONS} onSelect={vi.fn()} />);

    expect(screen.getByText('What are you looking for?')).toBeInTheDocument();
    for (const opt of OPTIONS) {
      expect(screen.getByRole('button', { name: opt.label })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Something else' })).toBeInTheDocument();
  });

  it('calls onSelect with the option\'s `value` when one is set', async () => {
    const onSelect = vi.fn();
    render(<QuickOptions icon={Compass} prompt="Prompt" options={OPTIONS} onSelect={onSelect} />);

    await userEvent.click(screen.getByRole('button', { name: 'Grow in the same role/organisation' }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("I'd like to grow in my current role.");
  });

  it('falls back to the label itself when an option has no `value`', async () => {
    const onSelect = vi.fn();
    render(<QuickOptions icon={Compass} prompt="Prompt" options={OPTIONS} onSelect={onSelect} />);

    await userEvent.click(screen.getByRole('button', { name: 'Make a job switch' }));

    expect(onSelect).toHaveBeenCalledWith('Make a job switch');
  });

  it('"Something else" reveals a custom text input in place of the toggle, and submits on click', async () => {
    const onSelect = vi.fn();
    render(
      <QuickOptions
        icon={Compass}
        prompt="Prompt"
        options={OPTIONS}
        onSelect={onSelect}
        customPlaceholder="Type your own..."
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Something else' }));

    const input = screen.getByPlaceholderText('Type your own...');
    expect(input).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Something else' })).not.toBeInTheDocument();

    await userEvent.type(input, 'My own custom answer');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('My own custom answer');
  });

  it('submits the custom answer on Enter, the same as clicking Send', async () => {
    const onSelect = vi.fn();
    render(<QuickOptions icon={Compass} prompt="Prompt" options={OPTIONS} onSelect={onSelect} />);

    await userEvent.click(screen.getByRole('button', { name: 'Something else' }));
    await userEvent.type(screen.getByLabelText("Type your own answer...", { exact: false }), 'Typed then enter{Enter}');

    expect(onSelect).toHaveBeenCalledWith('Typed then enter');
  });

  it('does not call onSelect for blank/whitespace-only custom text', async () => {
    const onSelect = vi.fn();
    render(<QuickOptions icon={Compass} prompt="Prompt" options={OPTIONS} onSelect={onSelect} />);

    await userEvent.click(screen.getByRole('button', { name: 'Something else' }));
    const sendButton = screen.getByRole('button', { name: 'Send' });
    expect(sendButton).toBeDisabled();

    await userEvent.type(screen.getByPlaceholderText("Type your own answer..."), '   ');
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('"Back" returns to the option list without calling onSelect', async () => {
    const onSelect = vi.fn();
    render(<QuickOptions icon={Compass} prompt="Prompt" options={OPTIONS} onSelect={onSelect} />);

    await userEvent.click(screen.getByRole('button', { name: 'Something else' }));
    await userEvent.type(screen.getByPlaceholderText("Type your own answer..."), 'abandoned text');
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.getByRole('button', { name: 'Something else' })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Type your own answer...")).not.toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('renders a Cancel control only when onCancel is provided, and calls it', async () => {
    const onCancel = vi.fn();
    const { rerender } = render(
      <QuickOptions icon={Compass} prompt="Prompt" options={OPTIONS} onSelect={vi.fn()} />
    );
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();

    rerender(<QuickOptions icon={Compass} prompt="Prompt" options={OPTIONS} onSelect={vi.fn()} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('disables every option button (and the "Something else" toggle) when disabled=true', () => {
    render(<QuickOptions icon={Compass} prompt="Prompt" options={OPTIONS} onSelect={vi.fn()} disabled />);

    for (const opt of OPTIONS) {
      expect(screen.getByRole('button', { name: opt.label })).toBeDisabled();
    }
    expect(screen.getByRole('button', { name: 'Something else' })).toBeDisabled();
  });
});
