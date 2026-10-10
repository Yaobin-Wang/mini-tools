import { it, expect } from 'vitest';
import { emptyWorkspace, importWorkspace } from './model';
it('长期方向兼容旧备份并完整往返，不恢复历史目标',()=>{
  const w=emptyWorkspace();w.legacyArchive={goals:[{title:'旧目标'}]};
  expect(importWorkspace(w).longTermGoals).toBeUndefined();
  w.longTermGoals=[{id:'direction-1',title:'示例方向',description:'说明',targetDate:'2028-02-29',completed:false,createdAt:1,updatedAt:2}];
  expect(importWorkspace(JSON.parse(JSON.stringify(w)))).toEqual(w);
  w.longTermGoals[0].targetDate='2027-02-29';expect(()=>importWorkspace(w)).toThrow();
  w.longTermGoals[0].targetDate='';w.longTermGoals.push({...w.longTermGoals[0]});expect(()=>importWorkspace(w)).toThrow();
});
