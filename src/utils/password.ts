import bcrypt from "bcryptjs";
export const hashPwd = (p: string) => bcrypt.hash(p, 12);
export const cmpPwd = (p: string, h: string) => bcrypt.compare(p, h);
