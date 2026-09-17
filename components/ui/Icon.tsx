export type IconName = "home"|"orders"|"return"|"calendar"|"products"|"warehouse"|"purchases"|"customers"|"finance"|"chats"|"settings"|"plus"|"search"|"arrow"|"alert"|"chart"|"branch"|"menu";

const paths: Record<IconName, React.ReactNode> = {
  home:<><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></>,
  orders:<><path d="M6 3h12v18H6z"/><path d="M9 7h6M9 11h6M9 15h4"/></>,
  return:<><path d="M9 7 4 12l5 5"/><path d="M4 12h10a6 6 0 0 1 6 6"/></>,
  calendar:<><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
  products:<><path d="M20 12 12 20 4 12l8-8z"/><path d="m8 8 8 8"/></>,
  warehouse:<><path d="m3 9 9-6 9 6v12H3z"/><path d="M7 13h10v8M7 17h10"/></>,
  purchases:<><path d="M6 6h15l-2 9H8z"/><path d="M6 6 5 3H2M9 20h.01M18 20h.01"/></>,
  customers:<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
  finance:<><path d="M4 7h16M6 11h12M8 15h8M10 19h4"/><path d="M12 3v18"/></>,
  chats:<><path d="M21 15a4 4 0 0 1-4 4H8l-5 3 1.5-5A7 7 0 0 1 3 13V8a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/><path d="M8 11h.01M12 11h.01M16 11h.01"/></>,
  settings:<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.1A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.1A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.1A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.15.36.36.7.6 1 .3.27.68.4 1.1.4h.1v4h-.1c-.42 0-.8.13-1.1.4-.24.3-.45.64-.6 1z"/></>,
  plus:<path d="M12 5v14M5 12h14"/>, search:<><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>, arrow:<path d="m9 18 6-6-6-6"/>, alert:<><path d="M10.3 3.7 2.5 18a2 2 0 0 0 1.8 3h15.4a2 2 0 0 0 1.8-3L13.7 3.7a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></>, chart:<><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>, branch:<><circle cx="6" cy="5" r="2"/><circle cx="18" cy="7" r="2"/><circle cx="8" cy="19" r="2"/><path d="M8 5h4a4 4 0 0 1 4 4v3a5 5 0 0 1-5 5H8"/></>, menu:<><path d="M4 6h16M4 12h16M4 18h16"/></>
};
export function Icon({name,size=18}:{name:IconName;size?:number}){return <svg className="ui-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>}
