import fs from 'fs';
import path from 'path';
import os from 'os';

// Verified Google Session Cookies (Valid through 2027)
// Universal embedded fallback so Vercel production functions always have authenticated access
const VERIFIED_COOKIES_BASE64 = 'IyBOZXRzY2FwZSBIVFRQIENvb2tpZSBGaWxlCiMgaHR0cHM6Ly9jdXJsLmhheHguc2UvcmZjL2Nvb2tpZV9zcGVjLmh0bWwKIyBUaGlzIGlzIGEgZ2VuZXJhdGVkIGZpbGUhIERvIG5vdCBlZGl0LgoKLnlvdXR1YmUuY29tCVRSVUUJLwlUUlVFCTE3ODc5MDUwMjIJTE9HSU5fSU5GTwlBRm1tRjJzd1JBSWdJSWlVaU9zblF3azAwaG5yU0dWUnpldzh5LTVaaXBoUmkxc0ZYaVdTb0hzQ0lIbnQ4OFpTV2dRMThRdE9uc3ZxUENmRGk4WURHWDAwSTM3N2UyVkozNkhaOlFVUTNNak5tZUZkU04zZDJTblZXZGpobExWTmhjMlp1YW5vMFIzZG1kRlo2UzFZMVpHUTNZMWx5U1Rkd1UwVnhYM1ZEVkhKNWRpMXZaVjlHWkRSbmJVZzFYMVJXUWpaUE5HMVZWR2xTWnpacGRqQnZOMEpLWkUxbVdsVnJNakEwV1cwdE1qbHNkakJ6ZFVkVlQyUkVUM1ZsUzFaNVowdHVaazFvZUhJeVVtNTZSazlZTkZNelQwRXhhRk5VVVZwd1ZpMWZjRlowWmxoRlFYWnZOemh5T0c5bgoueW91dHViZS5jb20JVFJVRQkvCVRSVUUJMTc5MTMwNTkyMAlfX1NlY3VyZS1CVUNLRVQJQ0p3QgoueW91dHViZS5jb20JVFJVRQkvCUZBTFNFCTE4MjE1NDY1NTIJSFNJRAlBeDgwMlc5ZW5ZTkowclZOMQoueW91dHViZS5jb20JVFJVRQkvCVRSVUUJMTgyMTU0NjU1MglTU0lECUFrbWxVRVpIMWVlRlhPMXl4Ci55b3V0dWJlLmNvbQlUUlVFCS8JRkFMU0UJMTgyMTU0NjU1MglBUElTSUQJQlBZMk5YdjJfVlY3d1JPNi9BUjdGT3F2X1ZieHNub1RLVgoueW91dHViZS5jb20JVFJVRQkvCVRSVUUJMTgyMTU0NjU1MglTQVBJU0lECWZVRjlVd2ZkcnJLRktQZDMvQXNvWElQaEJ5VE8wbmZCSy0KLnlvdXR1YmUuY29tCVRSVUUJLwlUUlVFCTE4MjE1NDY1NTIJX19TZWN1cmUtMVBBUElTSUQJZlVGOVV3ZmRycktGS1BkMy9Bc29YSVBoQnlUTzBuZkJLLQoueW91dHViZS5jb20JVFJVRQkvCVRSVUUJMTgyMTU0NjU1MglfX1NlY3VyZS0zUEFQSVNJRAlmVUY5VXdmZHJyS0ZLUGQzL0Fzb1hJUGhCeVRPMG5mQkstCi55b3V0dWJlLmNvbQlUUlVFCS8JVFJVRQkxODIyMjI3OTEwCVBSRUYJZjY9NDAwMDAwMDAmdHo9RXVyb3BlLk1hZHJpZCZmNz0xMDAmcmVwZWF0PU5PTkUmYXV0b3BsYXk9dHJ1ZSZmNT0zMDAwMAoueW91dHViZS5jb20JVFJVRQkvCUZBTFNFCTE4MjE1NDY1NTIJU0lECWcuYTAwMEJBbE1lRDlXVTZXQ1pyRzR6UnJtMTJiTm13dUo4UjI1QXJabWw3a1ZvVXhUUDctQ0h0ZV9rMENHb0xCYUR5a2tQS1VfOHdBQ2dZS0FYOFNBUkVTRlFIR1gyTWlFcU1DOXVSWjV1QXlyWU03Q2N4Y3ZSb1ZBVUY4eUtwMnZ2bktkQTZKZWU4RC02R3lsekY3MDA3NgoueW91dHViZS5jb20JVFJVRQkvCVRSVUUJMTgyMTU0NjU1MglfX1NlY3VyZS0xUFNJRAlnLmEwMDBCQWxNZUQ5V1U2V0Nackc0elJybTEyYk5td3VKOFIyNUFyWm1sN2tWb1V4VFA3LUM1blBOZWV0RG0wdVd2am5yZmJtN1l3QUNnWUtBWHNTQVJFU0ZRSEdYMk1pQ3g2dWJFMU52VDY4LTRteHFqQ3E3eG9WQVVGOHlLcjdDY0h5VTR5UVUtelJsY3RqalVxZzAwNzYKLnlvdXR1YmUuY29tCVRSVUUJLwlUUlVFCTE4MjE1NDY1NTIJX19TZWN1cmUtM1BTSUQJZy5hMDAwQkFsTWVEOVdVNldDWnJHNHpScm0xMmJObXd1SjhSMjVBclptbDdrVm9VeFRQNy1DenBTMlNpdDUzWVVNWWx4S0Vmdl8td0FDZ1lLQVF3U0FSRVNGUUhHWDJNaUlmTFRNQUNfaVhaYV9hRHlZWjVmZmhvVkFVRjh5S3JxbGNOQVl1UmdzRy1iMjMwZXV5RDQwMDc2Ci55b3V0dWJlLmNvbQlUUlVFCS8JVFJVRQkxODAzMjMxMDQ0CV9fU2VjdXJlLVlFTklECTE3LllURT1ZbUtVVUFSZ1llZWV4X1dyOEhscG40ZkpjUWVobEFlbnNFZVlJem5BcnRPWGk1aGdVdnBVM0xuQ0dRaDlkdlliZjRiUHNGNnJDOThLMnlkWEVKOTYzbGluXzlFbl9oQnA0VzBnYzFCTHVELW02WW1RcnhoTEtveFBYNU1PNTRRVEZNemVpbjBBdGJfZDczMmFVREd2Rm5iSEhwUnpsWnBFblM5UXlndlkySHZVZ2FNbHpMZ2VPV3RWOHRDREJqVGhhZURHTWNVRXBZRE1VQ3RRbmJVdDdSb2Qtc2QzTDZRaEhMOUZnV0JHMFhGa0FjUTd0Tk1aRDBIS3BaVVUwaF95TkR2ZndPalZEVW5HNWNrQTZ3MHpfMzcwMUg0M2p3NzhxaUxGZENFYnBxMjMxNTVqYnZZWnRmNE5XTWphQy15bURWbS1ncWtXT2lKdnQ3dzVRdjJ3dFEKLnlvdXR1YmUuY29tCVRSVUUJLwlUUlVFCTE4MDM0NjY3MjkJTklECTUzND1ZRnhhekYyZ3R3ajJPYWl3MDhlUk5PNmR0Q1lDMWk3SXdyLXJaZndGYjhEQlAtLWRIZm1GdkpHSTQ4Z2w2OTZQYkxwYlMwS0x4UTFkcURhaWZXNlBtOXFpSlhwTGFSbjlBaFNRS1pEVzBWWnhiUV8yazRITkJOM1Q5anpkcFZubU93aG01ZG5vYUJMOFhVT0xCSktNaERPcmtZYjJkelF0YnpPTjdQbkJjMzhSbzhqLXE2VFFqWUU3V2k5blJoQjFSSVNKeTJURk9QWXpGV2l2aVNoMDVVZF9FM0xqZ2ItOFh3Ci55b3V0dWJlLmNvbQlUUlVFCS8JVFJVRQkxODE5MjAzNjEzCV9fU2VjdXJlLTFQU0lEVFMJc2lkdHMtQ2pRQlhNdzQxV1JtRXl3VjJOQVhIT1lEZkExQVUzRDk1NEVNTEdBN3c0eHVkVDNGbW4wNkVNcWI2QmlrMkRlM3A2OGZjU1NqRUFBCi55b3V0dWJlLmNvbQlUUlVFCS8JVFJVRQkxODE5MjAzNjEzCV9fU2VjdXJlLTNQU0lEVFMJc2lkdHMtQ2pRQlhNdzQxV1JtRXl3VjJOQVhIT1lEZkExQVUzRDk1NEVNTEdBN3c0eHVkVDNGbW4wNkVNcWI2QmlrMkRlM3A2OGZjU1NqRUFBCi55b3V0dWJlLmNvbQlUUlVFCS8JVFJVRQkxODAzMjMxMDQzCV9fU2VjdXJlLVlFQwlDZ3R1TFdSemRGRmhWRkJsWnlqQ3k3YlVCaklvQ2dKRlV4SWlFaDRTSEFzTURnOFFFUklURkJVV0Z4Z1pHaHNjSFI0ZklDRWlJeVFsSmljZ1VHTGdBZ3JkQWpFM0xsbFVSVDFaYlV0VlZVRlNaMWxsWldWNFgxZHlPRWhzY0c0MFprcGpVV1ZvYkVGbGJuTkZaVmxKZW01QmNuUlBXR2sxYUdkVmRuQlZNMHh1UTBkUmFEbGtkbGxpWmpSaVVITkdObkpET1RoTE1ubGtXRVZLT1RZemJHbHVYemxGYmw5b1FuQTBWekJuWXpGQ1RIVkVMVzAyV1cxUmNuaG9URXR2ZUZCWU5VMVBOVFJSVkVaTmVtVnBiakJCZEdKZlpEY3pNbUZWUkVkMlJtNWlTRWh3VW5wc1duQkZibE01VVhsbmRsa3lTSFpWWjJGTmJIcE1aMlZQVjNSV09IUkRSRUpxVkdoaFpVUkhUV05WUlhCWlJFMVZRM1JSYm1KVmREZFNiMlF0YzJRelREWlJhRWhNT1VablYwSkhNRmhHYTBGalVUZDBUazFhUkRCSVMzQmFWVlV3YUY5NVRrUjJabmRQYWxaRVZXNUhOV05yUVRaM01IcGZNemN3TVVnME0ycDNOemh4YVV4R1pFTkZZbkJ4TWpNeE5UVnFZblpaV25SbU5FNVhUV3BoUXkxNWJVUldiUzFuY1d0WFQybEtkblEzZHpWUmRqSjNkRkUlM0QKLnlvdXR1YmUuY29tCVRSVUUJLwlGQUxTRQkxODE5MjAzOTEzCVNJRENDCUFLRXlYelVLN1BvUGhuN3F1cEZvZUtySHZyMkYzakxGUEFwQTRPblI2ZmNOT1dzZU5rZ0F3elFNOXpOSW0wVzB5SlU4UDZ0eFZ1WQoueW91dHViZS5jb20JVFJVRQkvCVRSVUUJMTgxOTIwMzkxMwlfX1NlY3VyZS0xUFNJRENDCUFLRXlYeldpMHR2ei1BOXJ3amVtZ0c4aXI0aHFfY2c0dl84d2xhVUViQzRRd1RMdXpvb1FqZHpJY2tJcXV5dVItZm5Gc1dpS1V0akcKLnlvdXR1YmUuY29tCVRSVUUJLwlUUlVFCTE4MTkyMDM5MTMJX19TZWN1cmUtM1BTSURDQwlBS0V5WHpYb1pLWHhDRWR6OUptcFR1VjdBUi1ITE1WVVh3OXpMR1AwMnRkT0xBNG1EbWhDQmdCUjJkUWQ1d0MyRW5xN25rdGFmdwoueW91dHViZS5jb20JVFJVRQkvCVRSVUUJMTgyMTc5NTkwNwlWSVNJVE9SX1BSSVZBQ1lfTUVUQURBVEEJQ2dKRlV4SWlFaDRTSEFzTURnOFFFUklURkJVV0Z4Z1pHaHNjSFI0ZklDRWlJeVFsSmljZ1VBJTNEJTNECi55b3V0dWJlLmNvbQlUUlVFCS8JVFJVRQkwCVlTQwlHajdkTDZleHpRawoueW91dHViZS5jb20JVFJVRQkvCVRSVUUJMTgwMzIwNzUyMglfX1NlY3VyZS1ST0xMT1VUX1RPS0VOCUNPdjY1YWl3djdXMnRnRVF4Wi1EcHRid2lnTVl5ZmJLNHMtN2xnTSUzRAo=';

let cookiesFilePath: string | null = null;

export async function getYouTubeCookiesFile(): Promise<string | null> {
  if (cookiesFilePath && fs.existsSync(cookiesFilePath)) {
    return cookiesFilePath;
  }

  let cookiesContent: string | null = null;

  // Priority 1: Environment variable if user sets custom ones in Vercel Dashboard
  if (process.env.YOUTUBE_COOKIES_BASE64) {
    try {
      cookiesContent = Buffer.from(
        process.env.YOUTUBE_COOKIES_BASE64,
        'base64'
      ).toString('utf-8');
    } catch (e) {
      console.warn('[ytdl/cookies] Failed to decode YOUTUBE_COOKIES_BASE64:', e);
    }
  }

  // Priority 2: Plain text env var
  if (!cookiesContent && process.env.YOUTUBE_COOKIES) {
    cookiesContent = process.env.YOUTUBE_COOKIES;
  }

  // Priority 3: Universal verified fallback
  if (!cookiesContent && VERIFIED_COOKIES_BASE64) {
    try {
      cookiesContent = Buffer.from(
        VERIFIED_COOKIES_BASE64,
        'base64'
      ).toString('utf-8');
    } catch (e) {
      console.warn('[ytdl/cookies] Failed to decode embedded cookies:', e);
    }
  }

  if (!cookiesContent || cookiesContent.trim().length < 10) {
    return null;
  }

  // Clean UTF-8 BOM, normalize line endings, and unescape literal \n or \t if pasted via CLI/Vercel
  cookiesContent = cookiesContent
    .replace(/^\uFEFF/, '')
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\r\n/g, '\n');

  cookiesFilePath = path.join(os.tmpdir(), 'yt-verified-cookies.txt');
  try {
    await fs.promises.writeFile(cookiesFilePath, cookiesContent, {
      encoding: 'utf-8',
      flag: 'w',
    });
    return cookiesFilePath;
  } catch (e) {
    console.error('[ytdl/cookies] Failed to write cookies file:', e);
    return null;
  }
}

export async function buildCookieArgs(): Promise<string[]> {
  const cookiesFile = await getYouTubeCookiesFile();
  if (cookiesFile) {
    return [
      '--cookies', cookiesFile,
      '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      '--add-header', 'Accept-Language: es-ES,es;q=0.9,en;q=0.8',
    ];
  }
  return [
    '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    '--add-header', 'Accept-Language: es-ES,es;q=0.9,en;q=0.8',
  ];
}

