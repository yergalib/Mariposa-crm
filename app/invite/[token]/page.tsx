import { getInvitation } from "@/lib/staff/invitations";
import { acceptInviteAction } from "./actions";

export default async function Page({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params, query = await searchParams;
  let invitation: Awaited<ReturnType<typeof getInvitation>> | null = null;
  try { invitation = await getInvitation(token); } catch { invitation = null; }
  if (!invitation) return <main className="login-page"><section className="login-card"><h1>Приглашение недействительно</h1><p>Срок истёк, приглашение отозвано или уже использовано.</p></section></main>;
  return <main className="login-page"><form action={acceptInviteAction} className="login-card"><input type="hidden" name="token" value={token}/><h1>Приглашение в {invitation.organization.name}</h1><p>{invitation.email} · {invitation.role}</p><p>{invitation.existingUser?"У этого email уже есть аккаунт. Подтвердите его текущим паролем — новый пользователь создан не будет.":"Создайте пароль для нового аккаунта. Минимум 12 символов."}</p>{query.error&&<p className="form-error">{query.error}</p>}<label>{invitation.existingUser?"Текущий пароль":"Новый пароль"}<input type="password" name="password" minLength={invitation.existingUser?1:12} required autoComplete={invitation.existingUser?"current-password":"new-password"}/></label>{!invitation.existingUser&&<label>Повторите пароль<input type="password" name="confirmation" minLength={12} required autoComplete="new-password"/></label>}<button>Принять приглашение</button></form></main>;
}
