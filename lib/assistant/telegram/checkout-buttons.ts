import {z} from 'zod';
export type TelegramKeyboard={inline_keyboard:{text:string;callback_data:string}[][]};
const uuid=z.string().uuid();
export function selectionButtons(turnId:string,count:number):TelegramKeyboard{
 uuid.parse(turnId);if(!Number.isInteger(count)||count<0||count>9)throw Error('Invalid options');
 return {inline_keyboard:[...Array.from({length:count},(_,i)=>[{text:`Выбрать вариант ${i+1}`,callback_data:`s:${turnId}:${i}`}]),[{text:'Нужна помощь сотрудника',callback_data:`s:${turnId}:-1`}]]};
}
export function confirmationButtons(draftId:string):TelegramKeyboard{
 uuid.parse(draftId);return {inline_keyboard:[[{text:'Подтвердить заявку',callback_data:`c:${draftId}`}],[{text:'Изменить выбор',callback_data:`r:${draftId}`}]]};
}
export function cancelSelectionButton(version:string):TelegramKeyboard{
 uuid.parse(version);return {inline_keyboard:[[{text:'Изменить выбор',callback_data:`x:${version}`}]]};
}
