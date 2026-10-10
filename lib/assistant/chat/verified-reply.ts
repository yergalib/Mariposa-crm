import type { ChatCard } from './contracts';
import type { OutfitContext } from './outfit-contracts';
import { formatCatalogMoney } from '@/lib/showroom/money';
// Arbitrary model prose cannot be made factual with a language-specific regex.
// It never crosses this rendering boundary. Only current-turn validated tool IDs
// and typed CRM results supply facts; tools here cannot perform any write action.
export function verifiedReply(cards: ChatCard[], compared: number, context: OutfitContext) {
  const facts=cards.slice(0,3).map((card,index)=>'Вариант '+(index+1)+': '+(card.item.price?formatCatalogMoney(card.item.price.amountMinor,card.item.price.currency)+' — каталожная цена аренды':'стоимость нужно уточнить')+'. '+(card.item.available?'CRM: доступно на выбранный период; подтвердит сотрудник.':'CRM: недоступно на выбранный период.'));
  if(compared)facts.push('Карточки для сравнения прочитаны из CRM. Посадку и свойства, которых нет в карточке, уточните у сотрудника.');
  if(!cards.length&&!compared){
    const criteria=context.criteria[context.activeSlot];
    facts.push('Подтверждённых цен и наличия для этого ответа пока нет.');
    if(context.heightCm)facts.push('Рост '+context.heightCm+' см сохранён как пожелание, а не гарантированный размер.');
    if(!criteria.size&&context.activeSlot!=='accessory')facts.push('Какой размер указан на бирке подходящей вещи?');
    else if(!context.from||!context.until)facts.push('Укажите даты и время получения и возврата, чтобы проверить наличие.');
    else facts.push('Уточните пожелания или обсудите выбор с сотрудником.');
  }
  facts.push('Сообщения сотруднику не отправлены; бронь и запись не созданы.');
  return facts.join(' ');
}
