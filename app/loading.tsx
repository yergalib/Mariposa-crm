import { Skeleton } from "@/components/ui";

export default function Loading(){return <main className="route-loading" aria-label="Загрузка страницы"><div className="route-loading-head"><Skeleton lines={2}/></div><div className="route-loading-grid"><div className="ui-card"><Skeleton lines={4}/></div><div className="ui-card"><Skeleton lines={5}/></div></div></main>}
