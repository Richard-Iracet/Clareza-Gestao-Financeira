import {OpenFinanceError} from './errors.js'
const encode=(bytes)=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')
export const createCallbackState=({userId,connectionId,ttlMs=10*60*1000,now=Date.now()})=>({state:encode(crypto.getRandomValues(new Uint8Array(32))),userId,connectionId,expiresAt:new Date(now+ttlMs).toISOString(),usedAt:null})
export const consumeCallbackState=({record,state,userId,connectionId,now=Date.now()})=>{if(!record||record.state!==state||record.userId!==userId||record.connectionId!==connectionId||record.usedAt||Date.parse(record.expiresAt)<=now)throw new OpenFinanceError('CALLBACK_INVALID','Callback inválido ou expirado.');return{...record,usedAt:new Date(now).toISOString()}}
