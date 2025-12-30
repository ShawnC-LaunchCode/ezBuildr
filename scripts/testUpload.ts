
async function test() {
    try {
        console.log("Preparing upload...");
        const pdfContent = Buffer.from('%PDF-1.4\n%EOF');
        const blob = new Blob([pdfContent], { type: 'application/pdf' });

        const form = new FormData();
        form.append('file', blob, 'test.pdf');

        console.log("Sending request...");
        const res = await fetch('http://localhost:5000/api/ai/doc/extract-text', {
            method: 'POST',
            body: form,
            headers: {
                // Add a dummy auth header if needed, but we expect 401 if it works
                // 'Authorization': 'Bearer ...'
            }
        });

        console.log("Status:", res.status, res.statusText);
        const text = await res.text();
        console.log("Body:", text);
    } catch (e) {
        console.error("Error:", e);
    }
}

test();
