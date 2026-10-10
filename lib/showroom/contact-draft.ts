export type ContactDraft={purpose:'booking'|'fitting';productName?:string;execution?:string|null;size?:string;branchLabel?:string;period?:{from:string;until:string};additionalItems?:{name:string;execution?:string|null;size:string}[];requestText?:string;preferredDay?:string;preferredTime?:string};
export function contactDraftText(value:ContactDraft){
 const lines=[value.purpose==='booking'?'Здравствуйте! Хочу обсудить аренду.':'Здравствуйте! Хочу согласовать примерку.'];
 if(value.productName)lines.push('Модель: '+value.productName+(value.execution?' · '+value.execution:'')+(value.size?' · размер '+value.size:''));
 for(const item of value.additionalItems??[])lines.push('Дополнительно: '+item.name+(item.execution?' · '+item.execution:'')+' · размер '+item.size);
 if(value.branchLabel)lines.push('Филиал: '+value.branchLabel);
 if(value.purpose==='booking'&&value.period)lines.push('Пожелание к аренде: '+value.period.from.replace('T',' ')+' — '+value.period.until.replace('T',' ')+' (местное время филиала).');
 if(value.purpose==='fitting'&&(value.preferredDay||value.preferredTime))lines.push('Пожелание к визиту: '+(value.preferredDay||'день уточнить')+', '+(value.preferredTime||'время уточнить')+'.');
 if(value.requestText)lines.push('Пожелания: '+value.requestText);
 lines.push('Пожалуйста, уточните наличие, стоимость и условия. Бронь или запись ещё не подтверждены.');
 return lines.join('\n').slice(0,2400);
}
