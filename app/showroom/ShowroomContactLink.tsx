import { showroomContact } from "./site-content";

export function ShowroomContactLink({message}: {message?:string} = {}) {
  const href=new URL(showroomContact.whatsapp);if(message)href.searchParams.set("text",message);
  return <a className="site-button" href={href.toString()} target="_blank" rel="noopener noreferrer">Написать в WhatsApp шоурума</a>;
}
