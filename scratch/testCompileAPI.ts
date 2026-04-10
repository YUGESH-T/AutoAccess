import fs from 'fs';

async function test() {
  console.log("SENDING REQUEST");
  const res = await fetch('http://localhost:3000/api/compile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: "Hello World!" })
  });
  
  const text = await res.text();
  console.log("STATUS:", res.status);
  try {
    const data = JSON.parse(text);
    console.log("SUCCESS:", data.success);
    if (data.pdfBase64) {
      console.log("Writing test.pdf");
      const buffer = Buffer.from(data.pdfBase64, 'base64');
      fs.writeFileSync('test.pdf', buffer);
      console.log("Done. File size:", buffer.length);
    } else {
      console.log("Response JSON:", data);
    }
  } catch(e) {
    console.log("FAILED TO PARSE JSON");
    console.log(text);
  }
}

test();
