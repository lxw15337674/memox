// 测试 AI 搜索功能
async function testAISearch() {
    const testQuery = "共识";
    
    console.log(`🔍 测试AI搜索查询: "${testQuery}"`);
    
    try {
        const response = await fetch("http://localhost:3000/api/ai/search", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                query: testQuery
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        console.log("✅ AI搜索响应:");
        console.log("完整响应:", JSON.stringify(data, null, 2));
        
        console.log(`- 查询时间: ${data.responseTime || data.response_time || '未知'}ms`);
        console.log(`- 找到结果: ${data.results ? data.results.length : '未知'} 条`);
        console.log(`- 搜索类型: ${data.searchType || data.search_type || "未知"}`);
        
        if (data.results && data.results.length > 0) {
            console.log("\n📝 搜索结果预览:");
            data.results.slice(0, 3).forEach((result, index) => {
                console.log(`${index + 1}. ID: ${result.id.substring(0, 8)}...`);
                console.log(`   相似度: ${(result.similarity_score || 0).toFixed(3)}`);
                console.log(`   内容: ${result.content.substring(0, 100)}...`);
                console.log("");
            });
        }
        
        return data;
        
    } catch (error) {
        console.error("❌ AI搜索测试失败:", error);
        throw error;
    }
}

// 运行测试
testAISearch()
    .then((result) => {
        console.log("🎉 AI搜索测试完成!");
    })
    .catch((error) => {
        console.error("💥 测试失败:", error);
        process.exit(1);
    });
