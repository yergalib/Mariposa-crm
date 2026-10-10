"use server";
import { redirect } from "next/navigation";
import { createAuthSession, revokeCurrentSession } from "@/lib/auth/session";
import { authenticateLogin, LOGIN_FAILURE } from "@/lib/auth/login-protection";
export type LoginState = { error: string | null };
export async function loginAction(_previousState:LoginState,formData:FormData):Promise<LoginState>{
 try{
  const identity=await authenticateLogin(formData.get("email"),formData.get("password"));
  if(!identity)return{error:LOGIN_FAILURE};
  await createAuthSession(identity);
 }catch{console.warn("login_unavailable",{category:"AUTH_DEPENDENCY"});return{error:LOGIN_FAILURE};}
 redirect("/");
}
export async function logoutAction(){await revokeCurrentSession();redirect("/login");}
