#!/usr/bin/env python3
"""Read-only Cloudflare API GET / GraphQL helper. Token comes from ../../.env into a header; never printed or put in argv."""
import json,sys,urllib.request,urllib.error,os
tok=[x for x in open(os.path.join(os.path.dirname(__file__),'../../../.env')) if x.startswith('CLOUDFLARE_API_TOKEN=')][0].rstrip('\n').split('=',1)[1].strip('"\'')
ACC=os.environ['CLOUDFLARE_ACCOUNT_ID']
def call(path,body=None):
    url='https://api.cloudflare.com/client/v4'+path
    req=urllib.request.Request(url,data=json.dumps(body).encode() if body else None,headers={'Authorization':'Bearer '+tok,'Content-Type':'application/json','User-Agent':'curl/8.15.0'})
    try: r=urllib.request.urlopen(req,timeout=60); return r.status,json.loads(r.read())
    except urllib.error.HTTPError as e:
        try: return e.code,json.loads(e.read())
        except Exception: return e.code,None
if __name__=='__main__':
    st,j=call(sys.argv[1].replace('{ACC}',ACC)); print(st); print(json.dumps(j,indent=1).replace(tok,'[tok]')[:int(sys.argv[2]) if len(sys.argv)>2 else 3000])
