/**
 * FollowUpCallout render tests (static markup, no DOM). Surfaces the question;
 * renders chips only when replies exist; chips disabled when no onReply wired.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { FollowUpCallout } from './FollowUpCallout';

const noop = () => {};

describe('FollowUpCallout', () => {
  it('surfaces the question and the "asking a follow-up" label', () => {
    const html = renderToStaticMarkup(
      <FollowUpCallout followUp={{ question: 'Ecommerce or docs?', replies: [] }} onReply={noop} />,
    );
    expect(html).toContain('asking a follow-up');
    expect(html).toContain('Ecommerce or docs?');
  });

  it('renders a chip per reply', () => {
    const html = renderToStaticMarkup(
      <FollowUpCallout
        followUp={{ question: 'Which one?', replies: ['ecommerce', 'documentation'] }}
        onReply={noop}
      />,
    );
    expect(html).toContain('ecommerce');
    expect(html).toContain('documentation');
    expect(html).toContain('followup__chip');
  });

  it('renders no chip group when there are no replies', () => {
    const html = renderToStaticMarkup(
      <FollowUpCallout followUp={{ question: 'What is your use case?', replies: [] }} onReply={noop} />,
    );
    expect(html).not.toContain('followup__chip');
  });

  it('disables chips when no onReply is wired', () => {
    const html = renderToStaticMarkup(
      <FollowUpCallout followUp={{ question: 'A or B?', replies: ['A', 'B'] }} />,
    );
    expect(html).toContain('disabled');
  });
});
