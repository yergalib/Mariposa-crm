import type { VerifiedFact } from '@/lib/assistant/chat/contracts';

// Only server-selected current-turn facts, presented within the conversation.
export function AssistantFactPanels({ facts = [] }: { facts?: VerifiedFact[] }) {
  if (!facts.length) return null;
  return <>{facts.map(fact => <section key={fact.id}
    aria-label={fact.kind === 'rules' ? 'Условия аренды' : fact.kind === 'branches' ? 'Филиалы' : 'Контакты шоурума'}
    data-fact-ref={fact.id}>
    {fact.kind === 'rules'
      ? <p>{fact.lines.map(line => /[.!?]$/.test(line) ? line : line + '.').join(' ')}</p>
      : fact.lines.map((line, index) => <p key={index}>{line}</p>)}
    {fact.links?.map(link => <p key={link.href}><a href={link.href} target="_blank" rel="noopener noreferrer">{link.label}</a></p>)}
  </section>)}</>;
}
