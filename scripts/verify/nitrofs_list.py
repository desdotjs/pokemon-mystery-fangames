import sys,struct,hashlib
p=sys.argv[1];d=open(p,'rb').read()
print("size",len(d),"sha1",hashlib.sha1(d).hexdigest())
print("title",d[0:12],"code",d[12:16],"maker",d[16:18],"rev",d[0x1E])
fnt_off,fnt_sz,fat_off,fat_sz=struct.unpack_from('<IIII',d,0x40)
def fat(i): return struct.unpack_from('<II',d,fat_off+i*8)
out=[]
def walk(dirid,path):
    o=fnt_off+(dirid&0xfff)*8
    sub,first,_=struct.unpack_from('<IHH',d,o)
    p2=fnt_off+sub;fid=first
    while True:
        l=d[p2];p2+=1
        if l==0:break
        n=d[p2:p2+(l&0x7f)].decode('latin1');p2+=l&0x7f
        if l&0x80:
            did=struct.unpack_from('<H',d,p2)[0];p2+=2;walk(did,path+n+'/')
        else:
            s,e=fat(fid);out.append((path+n,e-s));fid+=1
walk(0xF000,'')
from collections import defaultdict
agg=defaultdict(lambda:[0,0])
for n,s in out:
    top=n.split('/')[0] if '/' in n else '(root)';agg[top][0]+=1;agg[top][1]+=s
print("files",len(out))
for k,(c,s) in sorted(agg.items()):print(f"{k:12} {c:5} files {s/1e6:7.2f} MB")
want=['MONSTER/m_ground.bin','MONSTER/monster.bin','MONSTER/m_attack.bin','FONT/kaomado.kao','DUNGEON/dungeon.bin','MESSAGE/text_e.str','BALANCE/monster.md','BALANCE/waza_p.bin','BALANCE/item_p.bin','BALANCE/mappa_s.bin']
names={n for n,_ in out}
for w in want:print(("OK  " if w in names else "MISS"),w)
ext=defaultdict(int)
for n,_ in out:
    if n.startswith(('MAP_BG/','SOUND/')):ext[n.split('/')[0]+'/*.'+n.rsplit('.',1)[-1].lower()]+=1
for k,v in sorted(ext.items()):print(k,v)
