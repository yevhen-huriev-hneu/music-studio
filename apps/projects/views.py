from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from .models import Project, AudioTrack
from .forms import ProjectForm
from apps.ai_chat.models import ChatMessage


@login_required
def project_list(request):
    projects = Project.objects.filter(user=request.user).prefetch_related('tracks')
    return render(request, 'projects/project_list.html', {'projects': projects})


@login_required
def project_create(request):
    if request.method == 'POST':
        form = ProjectForm(request.POST)
        if form.is_valid():
            project = form.save(commit=False)
            project.user = request.user
            project.save()
            messages.success(request, 'Проєкт створено!')
            return redirect('projects:detail', pk=project.pk)
    else:
        form = ProjectForm()

    return render(request, 'projects/project_create.html', {'form': form})


@login_required
def project_detail(request, pk):
    project = get_object_or_404(Project, pk=pk, user=request.user)
    tracks = project.tracks.all()
    chat_messages = project.messages.order_by('created_at')

    if request.method == 'POST':
        form = ProjectForm(request.POST, instance=project)
        if form.is_valid():
            form.save()
            messages.success(request, 'Проєкт оновлено!')
            return redirect('projects:detail', pk=project.pk)
    else:
        form = ProjectForm(instance=project)

    return render(request, 'projects/project_detail.html', {
        'project': project,
        'tracks': tracks,
        'chat_messages': chat_messages,
        'form': form,
    })


@login_required
@require_http_methods(['DELETE'])
def project_delete(request, pk):
    project = get_object_or_404(Project, pk=pk, user=request.user)
    project.delete()
    return JsonResponse({'status': 'deleted'})
