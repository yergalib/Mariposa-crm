export function normalizeEmail(value:string){return value.trim().toLocaleLowerCase("en-US");}
export function normalizePhone(value:string, defaultCountryCode="7"){
  let digits=value.replace(/\D/g,"");
  const international=value.trim().startsWith("+");
  if(!international&&defaultCountryCode==="7"&&digits.length===11&&digits.startsWith("8"))digits=`7${digits.slice(1)}`;
  if(!international&&defaultCountryCode&&digits.length===10)digits=`${defaultCountryCode}${digits}`;
  return digits.length>=7&&digits.length<=15?`+${digits}`:"";
}
