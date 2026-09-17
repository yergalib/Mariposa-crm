import Link from "next/link";
import { Icon, type IconName } from "./Icon";

export function PageHeader({title,subtitle,eyebrow,actions}:{title:string;subtitle?:string;eyebrow?:string;actions?:React.ReactNode}){return <header className="page-header"><div className="page-heading">{eyebrow&&<span className="page-eyebrow">{eyebrow}</span>}<h1>{title}</h1>{subtitle&&<p>{subtitle}</p>}</div>{actions&&<div className="page-actions">{actions}</div>}</header>}
export function ButtonLink({href,children,variant="secondary",icon}:{href:string;children:React.ReactNode;variant?:"primary"|"secondary"|"quiet";icon?:IconName}){return <Link href={href} className={`ui-button ${variant}`}>{icon&&<Icon name={icon}/>}<span>{children}</span></Link>}
export function SectionCard({title,description,action,children,className=""}:{title?:string;description?:string;action?:React.ReactNode;children:React.ReactNode;className?:string}){return <section className={`ui-card ${className}`}>{(title||action)&&<div className="ui-card-head"><div>{title&&<h2>{title}</h2>}{description&&<p>{description}</p>}</div>{action}</div>}{children}</section>}
export function EmptyState({title,description,compact=false}:{title:string;description?:string;compact?:boolean}){return <div className={`ui-empty ${compact?"compact":""}`}><span aria-hidden="true">—</span><strong>{title}</strong>{description&&<p>{description}</p>}</div>}
export function StatusChip({tone="neutral",children}:{tone?:"neutral"|"info"|"success"|"warning"|"danger"|"accent";children:React.ReactNode}){return <span className={`status-chip ${tone}`}>{children}</span>}
export function Skeleton({lines=3}:{lines?:number}){return <div className="ui-skeleton" aria-label="Загрузка" aria-busy="true">{Array.from({length:lines},(_,i)=><i key={i}/>)}</div>}
