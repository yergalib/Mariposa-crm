import {z} from "zod";
export const FITTING_STATUS_LABELS={SCHEDULED:"Запланирована",ARRIVED:"Клиент пришёл",COMPLETED:"Проведена",CANCELLED:"Отменена",NO_SHOW:"Неявка"} as const;
export const fittingStatus=z.enum(["SCHEDULED","ARRIVED","COMPLETED","CANCELLED","NO_SHOW"]);
const uuid=z.string().uuid(),optionalId=uuid.nullable().optional();
export const fittingInput=z.object({branchId:uuid,customerId:optionalId,inquiryId:optionalId,guestName:z.string().trim().max(120).default(""),guestContact:z.string().trim().max(254).default(""),startsAt:z.date(),assignedMembershipId:uuid,source:z.enum(["CRM","WEBSITE","TELEGRAM","WHATSAPP","PHONE","OTHER"]).default("CRM"),comment:z.string().trim().max(2000).default(""),variantIds:z.array(uuid).max(20).transform(ids=>[...new Set(ids)].sort())}).refine(value=>Boolean(value.customerId||value.guestName),{message:"Выберите клиента или укажите имя гостя."});
export const createFittingInput=fittingInput.safeExtend({creationKey:uuid});
export const updateFittingInput=fittingInput.safeExtend({id:uuid,version:z.number().int().positive(),status:fittingStatus});
