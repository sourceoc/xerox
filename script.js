let data = { professors: [], month: "agosto", lastModified: "", totalCopies: 0, usedCopies: 0 };
let githubUser = "sourceoc";
let githubRepo = "xerox";
let githubFile = "xerox_data_agosto.json";

async function saveToGitHub(manual = false) {
    const token = localStorage.getItem("githubToken");
    if (!token) {
        alert("Token do GitHub não configurado!");
        return;
    }

    try {
        const content = JSON.stringify(data, null, 2);

        const res = await fetch(`https://api.github.com/repos/${githubUser}/${githubRepo}/contents/${githubFile}`, {
            headers: { Authorization: `token ${token}` }
        });
        const fileData = await res.json();
        const sha = fileData.sha;

        const response = await fetch(`https://api.github.com/repos/${githubUser}/${githubRepo}/contents/${githubFile}`, {
            method: "PUT",
            headers: {
                Authorization: `token ${token}`,
                "Content-Type": "application/json; charset=utf-8"
            },
            body: JSON.stringify({
                message: `atualiza ${githubFile} [${manual ? "manual" : "auto"}]`,
                content: btoa(unescape(encodeURIComponent(content))),
                sha
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(`${response.status}: ${JSON.stringify(err)}`);
        }

        console.log("Salvo no GitHub com sucesso!");
        if (manual) alert("Salvo no GitHub com sucesso!");
    } catch (error) {
        console.error("Falha ao salvar:", error);
        alert("Falha ao salvar: " + error.message);
    }
}